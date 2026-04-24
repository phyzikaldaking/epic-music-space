import { NextRequest, NextResponse } from "next/server";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { awardBadge } from "@/lib/badges";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    console.error("[stripe-webhook] Invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        const sessionType = session.metadata?.type;
        if (sessionType === "boost") {
          await handleBoostCheckoutCompleted(session);
        } else if (sessionType === "tip") {
          await handleTipCheckoutCompleted(session);
        } else if (sessionType === "auction_win") {
          await handleAuctionWinCheckoutCompleted(session);
        } else if (sessionType === "AD_PURCHASE") {
          await handleAdPurchaseCompleted(session);
        } else {
          await handleLicenseCheckoutCompleted(session);
        }
      } else if (session.mode === "subscription") {
        await handleSubscriptionCheckoutCompleted(session);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutExpired(session);
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentFailed(pi);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(sub, event.type);
      break;
    }

    // Stripe Connect account updated — mark onboarding complete
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await handleConnectAccountUpdated(account);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────
// License purchase
// ─────────────────────────────────────────────────────────

async function handleLicenseCheckoutCompleted(
  session: Stripe.Checkout.Session,
) {
  const { songId, userId } = session.metadata ?? {};
  if (!songId || !userId) {
    console.error("[stripe-webhook] Missing metadata", session.metadata);
    return;
  }

  // Idempotency check
  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

  await prisma.$transaction(async (tx) => {
    const song = await tx.song.findUniqueOrThrow({
      where: { id: songId },
      include: { artist_: { select: { id: true, stripeConnectId: true } } },
    });
    const licensePrice = Number(song.licensePrice);

    // Atomically claim the next license slot. PostgreSQL's row-level UPDATE lock
    // serializes concurrent webhook calls — each gets a unique post-increment
    // soldLicenses value, eliminating the duplicate-tokenNumber race condition.
    const claimed = await tx.song.update({
      where: { id: songId },
      data: { soldLicenses: { increment: 1 } },
      select: { soldLicenses: true, totalLicenses: true },
    });
    const tokenNumber = claimed.soldLicenses;

    // If we went over capacity the entire transaction (including the increment)
    // will roll back, leaving soldLicenses unchanged.
    if (tokenNumber > claimed.totalLicenses) {
      throw new Error("Song is sold out");
    }

    const licenseToken = await tx.licenseToken.create({
      data: {
        songId,
        holderId: userId,
        tokenNumber,
        price: song.licensePrice,
        status: "ACTIVE",
      },
    });

    await tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
        licenseTokenId: licenseToken.id,
      },
    });

    // Revenue split: artist gets 90%, platform keeps 10%
    const artistShare = Math.round(licensePrice * 0.9 * 100) / 100;
    const period = new Date().toISOString().slice(0, 7); // e.g. "2026-04"

    // Create pending payout record for the artist
    await tx.payout.create({
      data: {
        userId: song.artistId,
        songId,
        licenseTokenId: licenseToken.id,
        amount: artistShare,
        period,
        status: "PENDING",
      },
    });

    // If artist has Stripe Connect, attempt automatic transfer
    const connectId = song.artist_.stripeConnectId;
    if (connectId) {
      try {
        const amountCents = Math.round(artistShare * 100);
        if (amountCents >= 100) {
          await stripe.transfers.create({
            amount: amountCents,
            currency: "usd",
            destination: connectId,
            metadata: {
              emsUserId: song.artistId,
              songId,
              licenseTokenId: licenseToken.id,
            },
          });
          await tx.payout.updateMany({
            where: {
              songId,
              userId: song.artistId,
              licenseTokenId: licenseToken.id,
            },
            data: { status: "PAID", paidAt: new Date() },
          });
        }
      } catch (err) {
        console.error(
          "[stripe-webhook] Transfer failed (will retry via manual payout)",
          err,
        );
      }
    }

    // Notify buyer
    await enqueueNotification({
      userId,
      type: "LICENSE_PURCHASED",
      title: "License acquired! 🎵",
      body: `You now hold license #${tokenNumber} for "${song.title}". You'll earn ${String(song.revenueSharePct)}% of every future sale.`,
      metadata: { songId, tokenNumber },
    });

    // Notify artist
    await enqueueNotification({
      userId: song.artistId,
      type: "LICENSE_SOLD",
      title: "License sold! 💰",
      body: `License #${tokenNumber} of "${song.title}" was purchased. $${artistShare.toFixed(2)} payout ${connectId ? "sent" : "pending Connect setup"}.`,
      metadata: { songId, tokenNumber, buyerId: userId },
    });
  });

  // Award badges outside the transaction (non-critical)
  await Promise.allSettled([
    awardBadge(userId, "LICENSE_HOLDER"),
    // Check if this is the artist's first sale
    (async () => {
      const song = await prisma.song.findUnique({
        where: { id: songId },
        select: { artistId: true, soldLicenses: true },
      });
      if (song && song.soldLicenses === 1) {
        await awardBadge(song.artistId, "FIRST_LICENSE_SOLD");
      }
    })(),
  ]);

  // Broadcast license sold event to realtime listeners
  const supabase = createServerSupabaseClient();
  if (supabase) {
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { title: true, artist: true, coverUrl: true, soldLicenses: true, licensePrice: true },
    });
    if (song) {
      const payload = {
        songId,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl ?? null,
        soldLicenses: song.soldLicenses,
      };
      track({
        event: "license_purchased",
        userId,
        properties: { songId, amount: Number(song.licensePrice) },
      });

      const results = await Promise.allSettled([
        supabase.channel(CHANNELS.marketplace).send({
          type: "broadcast",
          event: "license_sold",
          payload,
        }),
        supabase.channel(CHANNELS.leaderboard).send({
          type: "broadcast",
          event: "scores_updated",
          payload: { songId },
        }),
      ]);
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(
            "[stripe-webhook] Supabase broadcast failed",
            result.reason,
          );
        }
      }
    }
  }

  console.log(
    `[stripe-webhook] License granted: song=${songId} user=${userId}`,
  );
}

// ─────────────────────────────────────────────────────────
// Subscription purchase
// ─────────────────────────────────────────────────────────

const TIER_MAP: Record<string, string> = {
  starter: "STARTER",
  pro: "PRO",
  prime: "PRIME",
  label: "LABEL_TIER",
};

async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session,
) {
  const { userId, tier } = session.metadata ?? {};
  if (!userId || !tier) {
    console.error(
      "[stripe-webhook] Missing subscription metadata",
      session.metadata,
    );
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer?.id ?? null);

  const dbTier = TIER_MAP[tier] ?? "STARTER";

  await Promise.all([
    // Update user's subscription tier and store Stripe customer ID
    prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: dbTier as never,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    }),
    // Persist transaction record for the billing portal lookup
    prisma.transaction.create({
      data: {
        userId,
        amount: 0,
        type: "SUBSCRIPTION",
        status: "SUCCEEDED",
        stripeSessionId: session.id,
        stripePaymentIntentId: subscriptionId ?? undefined,
        metadata: {
          stripeCustomerId: customerId,
          tier,
          subscriptionId,
        },
      },
    }),
  ]);

  track({ event: "subscription_activated", userId, properties: { tier } });

  await enqueueNotification({
    userId,
    type: "SUBSCRIPTION_ACTIVATED",
    title: `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan activated! 🚀`,
    body: `Welcome to EMS ${tier.charAt(0).toUpperCase() + tier.slice(1)}. Your new features are live.`,
    metadata: { tier },
  });

  console.log(
    `[stripe-webhook] Subscription activated: user=${userId} tier=${tier}`,
  );
}

// ─────────────────────────────────────────────────────────
// Subscription lifecycle
// ─────────────────────────────────────────────────────────

async function handleSubscriptionChange(
  sub: Stripe.Subscription,
  eventType: string,
) {
  const customerId = sub.customer as string;

  // Find user by stored customer ID
  const tx = await prisma.transaction.findFirst({
    where: {
      metadata: {
        path: ["stripeCustomerId"],
        equals: customerId,
      },
    },
    select: { userId: true },
  });

  if (!tx) {
    console.warn(`[stripe-webhook] No user found for customer ${customerId}`);
    return;
  }

  const isCancelled =
    eventType === "customer.subscription.deleted" ||
    sub.status === "canceled" ||
    sub.status === "unpaid";

  if (isCancelled) {
    await prisma.user.update({
      where: { id: tx.userId },
      data: { subscriptionTier: "FREE" as never },
    });
    await enqueueNotification({
      userId: tx.userId,
      type: "SUBSCRIPTION_CANCELLED",
      title: "Subscription cancelled",
      body: "Your EMS subscription has ended. You can re-subscribe at any time from the pricing page.",
    });
  }

  console.log(
    `[stripe-webhook] Subscription ${eventType}: customer=${customerId}`,
  );
}

// ─────────────────────────────────────────────────────────
// Boost purchase
// ─────────────────────────────────────────────────────────

async function handleBoostCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { songId, userId, boostPoints } = session.metadata ?? {};
  if (!songId || !userId || !boostPoints) {
    console.error("[stripe-webhook] Missing boost metadata", session.metadata);
    return;
  }

  // Idempotency check
  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

  const points = Number(boostPoints);
  if (isNaN(points) || points <= 0) {
    console.error("[stripe-webhook] Invalid boostPoints", boostPoints);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Use a single atomic UPDATE with LEAST() so concurrent boost purchases
    // always accumulate correctly. A read-then-write pattern here would let
    // two simultaneous webhooks clobber each other's increments.
    const [song] = await tx.$queryRaw<Array<{ title: string; boostScore: number }>>`
      UPDATE "Song"
      SET "boostScore" = LEAST(100.0, "boostScore" + ${points}::float8)
      WHERE id = ${songId}
      RETURNING title, "boostScore"
    `;

    if (!song) {
      throw new Error(`Song not found: ${songId}`);
    }

    await tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
      },
    });

    await enqueueNotification({
      userId,
      type: "BOOST_ACTIVATED",
      title: "Boost activated! 🚀",
      body: `Your track "${song.title}" has been boosted. It will receive increased visibility immediately.`,
      metadata: { songId, boostPoints: points, newBoostScore: song.boostScore },
    });
  });

  console.log(
    `[stripe-webhook] Boost granted: song=${songId} user=${userId} points=${boostPoints}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout expired (abandoned) — mark PENDING → FAILED
// ─────────────────────────────────────────────────────────────────────────────

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const tx = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    select: { id: true, status: true, userId: true },
  });

  if (!tx || tx.status !== "PENDING") return;

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: "FAILED" },
  });

  await enqueueNotification({
    userId: tx.userId,
    type: "PAYMENT_FAILED",
    title: "Checkout expired",
    body: "Your checkout session expired before payment was completed. Your card was not charged. Visit the Marketplace to try again.",
    metadata: { stripeSessionId: session.id },
  });

  console.log(
    `[stripe-webhook] Checkout expired: session=${session.id} tx=${tx.id}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment intent failed — card declined, insufficient funds, etc.
// ─────────────────────────────────────────────────────────────────────────────

async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const tx = await prisma.transaction.findUnique({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true, status: true, userId: true },
  });

  if (!tx || tx.status === "SUCCEEDED") return;

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: "FAILED" },
  });

  const failureMsg =
    pi.last_payment_error?.message ?? "Your payment could not be processed.";

  await enqueueNotification({
    userId: tx.userId,
    type: "PAYMENT_FAILED",
    title: "Payment failed",
    body: `${failureMsg} Your card was not charged. Please try again with a different card.`,
    metadata: {
      paymentIntentId: pi.id,
      failureCode: pi.last_payment_error?.code,
    },
  });

  console.log(`[stripe-webhook] Payment failed: pi=${pi.id} tx=${tx.id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fan tip checkout completed
// ─────────────────────────────────────────────────────────────────────────────

async function handleTipCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { fromUserId, artistId, songId, message, amount } = session.metadata ?? {};
  if (!fromUserId || !artistId) {
    console.error("[stripe-webhook] Tip missing metadata", session.metadata);
    return;
  }

  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

  const tipAmount = parseFloat(amount ?? "0");
  const artistShare = Math.round(tipAmount * 0.9 * 100) / 100;
  const period = new Date().toISOString().slice(0, 7);

  // Resolve a songId for the payout record (Payout.songId is non-nullable)
  const targetSongId =
    songId ||
    (
      await prisma.song.findFirst({
        where: { artistId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      })
    )?.id;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
      },
    });

    if (targetSongId) {
      await tx.payout.create({
        data: {
          userId: artistId,
          songId: targetSongId,
          amount: artistShare,
          period,
          status: "PENDING",
        },
      });
    }
  });

  const artist = await prisma.user.findUnique({
    where: { id: artistId },
    select: { stripeConnectId: true, name: true },
  });
  if (artist?.stripeConnectId && Math.round(artistShare * 100) >= 100) {
    try {
      await stripe.transfers.create({
        amount: Math.round(artistShare * 100),
        currency: "usd",
        destination: artist.stripeConnectId,
        metadata: { emsUserId: artistId, type: "tip", fromUserId },
      });
    } catch (err) {
      console.error("[stripe-webhook] Tip transfer failed", err);
    }
  }

  const tipper = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: { name: true, username: true },
  });
  const tipperName = tipper?.name ?? tipper?.username ?? "A fan";

  await Promise.all([
    enqueueNotification({
      userId: artistId,
      type: "TIP_RECEIVED",
      title: `${tipperName} tipped you $${tipAmount.toFixed(2)}! 💸`,
      body: message ? `"${message}"` : `${tipperName} supports your music. Keep creating!`,
      metadata: { fromUserId, amount: tipAmount, message: message ?? null },
    }),
    enqueueNotification({
      userId: fromUserId,
      type: "TIP_SENT",
      title: "Tip sent!",
      body: `Your $${tipAmount.toFixed(2)} tip was delivered to ${artist?.name ?? "the artist"}.`,
      metadata: { artistId, amount: tipAmount },
    }),
  ]);

  console.log(`[stripe-webhook] Tip: from=${fromUserId} to=${artistId} amount=${tipAmount}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auction win checkout completed — grant license, settle auction
// ─────────────────────────────────────────────────────────────────────────────

async function handleAuctionWinCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { auctionId, songId, userId, sellerId } = session.metadata ?? {};
  if (!auctionId || !songId || !userId || !sellerId) {
    console.error("[stripe-webhook] Auction win missing metadata", session.metadata);
    return;
  }

  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

  const winAmount = Number(session.amount_total ?? 0) / 100;
  const artistShare = Math.round(winAmount * 0.9 * 100) / 100;
  const period = new Date().toISOString().slice(0, 7);

  await prisma.$transaction(async (tx) => {
    const song = await tx.song.findUniqueOrThrow({
      where: { id: songId },
      include: { artist_: { select: { id: true, stripeConnectId: true } } },
    });

    // Same atomic increment pattern: PostgreSQL row lock guarantees a unique tokenNumber.
    const claimed = await tx.song.update({
      where: { id: songId },
      data: { soldLicenses: { increment: 1 } },
      select: { soldLicenses: true, totalLicenses: true },
    });
    const tokenNumber = claimed.soldLicenses;

    if (tokenNumber > claimed.totalLicenses) {
      throw new Error("Song is sold out");
    }

    const licenseToken = await tx.licenseToken.create({
      data: { songId, holderId: userId, tokenNumber, price: winAmount, status: "ACTIVE" },
    });

    await Promise.all([
      tx.auction.update({ where: { id: auctionId }, data: { status: "SETTLED" } }),
      tx.transaction.update({
        where: { stripeSessionId: session.id },
        data: {
          status: "SUCCEEDED",
          stripePaymentIntentId: session.payment_intent as string | undefined,
          licenseTokenId: licenseToken.id,
        },
      }),
      tx.payout.create({
        data: {
          userId: sellerId,
          songId,
          licenseTokenId: licenseToken.id,
          amount: artistShare,
          period,
          status: "PENDING",
        },
      }),
    ]);

    const connectId = song.artist_.stripeConnectId;
    if (connectId && Math.round(artistShare * 100) >= 100) {
      try {
        await stripe.transfers.create({
          amount: Math.round(artistShare * 100),
          currency: "usd",
          destination: connectId,
          metadata: { emsUserId: sellerId, songId, auctionId, licenseTokenId: licenseToken.id },
        });
        await tx.payout.updateMany({
          where: { userId: sellerId, songId, licenseTokenId: licenseToken.id },
          data: { status: "PAID", paidAt: new Date() },
        });
      } catch (err) {
        console.error("[stripe-webhook] Auction transfer failed", err);
      }
    }

    await Promise.all([
      enqueueNotification({
        userId,
        type: "AUCTION_SETTLED",
        title: "License received! 🎵",
        body: `Congratulations! You now hold license #${tokenNumber} for "${song.title}". You'll earn ${String(song.revenueSharePct)}% of every future sale.`,
        metadata: { songId, auctionId, tokenNumber },
      }),
      enqueueNotification({
        userId: sellerId,
        type: "AUCTION_PAID",
        title: "Auction payment received! 💰",
        body: `Your auction for "${song.title}" has been settled. $${artistShare.toFixed(2)} payout is on the way.`,
        metadata: { auctionId, amount: winAmount },
      }),
    ]);
  });

  await awardBadge(userId, "LICENSE_HOLDER");

  console.log(`[stripe-webhook] Auction settled: auction=${auctionId} winner=${userId} song=${songId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Connect account updated
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Ad purchase
// ─────────────────────────────────────────────────────────────────────────────

async function handleAdPurchaseCompleted(session: Stripe.Checkout.Session) {
  const { adId, userId } = session.metadata ?? {};
  if (!adId || !userId) {
    console.error("[stripe-webhook] AD_PURCHASE missing metadata", session.metadata);
    return;
  }

  await prisma.adPlacement.updateMany({
    where: { id: adId, ownerId: userId },
    data: { isActive: true },
  });

  await enqueueNotification({
    userId,
    type: "AD_ACTIVATED",
    title: "Your ad is live!",
    body: "Your ad placement has been activated and is now visible to users.",
    metadata: { adId },
  });

  console.log(`[stripe-webhook] Ad activated: adId=${adId} userId=${userId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Connect account updated
// ─────────────────────────────────────────────────────────────────────────────

async function handleConnectAccountUpdated(account: Stripe.Account) {
  const emsUserId = account.metadata?.emsUserId;
  if (!emsUserId) {
    console.warn(
      "[stripe-webhook] account.updated missing emsUserId",
      account.id,
    );
    return;
  }

  // Persist the Connect account ID in case it was not stored yet
  await prisma.user.updateMany({
    where: { id: emsUserId },
    data: { stripeConnectId: account.id },
  });

  if (
    account.charges_enabled &&
    account.payouts_enabled &&
    account.details_submitted
  ) {
    await enqueueNotification({
      userId: emsUserId,
      type: "CONNECT_ONBOARDING_COMPLETE",
      title: "Payouts enabled! 💸",
      body: "Your Stripe account is verified. You will now receive automatic payouts when licenses sell.",
    });
    console.log(
      `[stripe-webhook] Connect onboarding complete: user=${emsUserId} account=${account.id}`,
    );
  }
}
