import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { Prisma, TaxFormStatus } from "@ems/db";
import { enqueueNotification, enqueuePayoutTransfer } from "@/lib/queues";

/** Typed Prisma P2002 check — avoids brittle error message string matching. */
function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { recordLicenseSale, recordTip, recordAdPurchase, recordRefund, recordAuctionWin, recordBoost, recordSubscription, recordServiceSale } from "@/lib/revenueShare";
import { sendArtistMilestoneEmail } from "@/lib/email";
import { recordRiskEvent } from "@/lib/riskEvents";
import { page } from "@/lib/pager";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    console.error("[stripe-webhook] Invalid signature", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Event-level dedupe: if Stripe redelivers the same event (network blip,
  // 5xx response, manual replay) the second pass is a no-op.
  try {
    await prisma.processedWebhook.create({
      data: { source: "stripe", eventId: event.id },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ received: true, deduped: true });
    }
    // Non-unique-constraint failures aren't fatal — continue processing.
    console.warn("[stripe-webhook] dedupe insert failed", err);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment") {
        const sessionType = session.metadata?.type;
        if (sessionType === "PLACEMENT_BID") await handlePlacementBidCompleted(session);
        else if (sessionType === "PLACEMENT_PURCHASE") await handlePlacementPurchaseCompleted(session);
        else if (sessionType === "boost") await handleBoostCheckoutCompleted(session);
        else if (sessionType === "tip") await handleTipCheckoutCompleted(session);
        else if (sessionType === "versus_tip") await handleVersusTipCompleted(session);
        else if (sessionType === "auction_win") await handleAuctionWinCheckoutCompleted(session);
        else if (sessionType === "AD_PURCHASE") await handleAdPurchaseCompleted(session);
        else if (sessionType === "service_purchase") await handleServicePurchaseCompleted(session);
        else await handleLicenseCheckoutCompleted(session);
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
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await handleConnectAccountUpdated(account);
      break;
    }
    case "account.application.deauthorized": {
      // The event delivers an Application, but the connected account id is
      // the top-level event.account field.
      if (event.account) await handleConnectAccountDeauthorized(event.account);
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeRefunded(charge);
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleChargeDispute(dispute, event.type);
      break;
    }
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentIntentCanceled(pi);
      break;
    }
    case "customer.deleted": {
      const customer = event.data.object as Stripe.Customer;
      await handleCustomerDeleted(customer);
      break;
    }
    case "identity.verification_session.verified":
    case "identity.verification_session.requires_input":
    case "identity.verification_session.canceled": {
      const vs = event.data.object as Stripe.Identity.VerificationSession;
      await handleIdentityVerificationEvent(vs, event.type);
      break;
    }
    // Stripe (or the platform) reversed a transfer — common after a refund
    // is issued and the platform reclaims funds from the artist. Without
    // this handler the artist's Payout row stays PAID but the dollars left
    // their account. Note: there's no async transfer.failed event in the
    // Stripe model — transfers fail synchronously on create, or asynchronously
    // get reversed; the connected-account payout.failed below covers the
    // "artist's bank rejected the deposit" case.
    case "transfer.reversed": {
      const transfer = event.data.object as Stripe.Transfer;
      await handleTransferReversed(transfer);
      break;
    }
    // Connected-account events. Stripe payout = the connected account's
    // own bank deposit. payout.paid is the strongest signal that the
    // money actually landed in the artist's bank. payout.failed means
    // their bank rejected it (closed account, wrong routing #, etc.) and
    // is the most-reported reason for "where's my money?" tickets.
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      if (event.account) await handleConnectPayoutPaid(payout, event.account);
      break;
    }
    case "payout.failed": {
      const payout = event.data.object as Stripe.Payout;
      if (event.account) await handleConnectPayoutFailed(payout, event.account);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function handlePlacementBidCompleted(session: Stripe.Checkout.Session) {
  const { songId, userId, bidPower, amountUsd, placement } = session.metadata ?? {};
  if (!songId || !userId || !bidPower || !amountUsd) {
    console.error("[stripe-webhook] PLACEMENT_BID missing metadata", session.metadata);
    return;
  }

  const existing = await prisma.transaction.findUnique({ where: { stripeSessionId: session.id } });
  if (existing?.status === "SUCCEEDED") return;

  const power = Number(bidPower);
  if (!Number.isFinite(power) || power <= 0) {
    console.error("[stripe-webhook] Invalid PLACEMENT_BID power", bidPower);
    return;
  }

  const song = await prisma.$transaction(async (tx) => {
    const updated = await tx.song.update({
      where: { id: songId },
      data: { boostScore: { increment: power } },
      select: { id: true, title: true, artist: true, artistId: true, aiScore: true, boostScore: true },
    });

    await tx.transaction.updateMany({
      where: { stripeSessionId: session.id, userId, songId },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
        metadata: { type: "PLACEMENT_BID", placement, bidPower: power, amountUsd: Number(amountUsd) },
      },
    });

    return updated;
  });

  await enqueueNotification({
    userId,
    type: "BOOST_ACTIVATED",
    title: "Bid accepted — placement power added! ⚡",
    body: `Your bid added ${power} placement power to "${song.title}". Current rank score: ${(song.aiScore + song.boostScore).toFixed(1)}.`,
    metadata: { songId, bidPower: power, placement },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase.channel(CHANNELS.leaderboard).send({
      type: "broadcast",
      event: "bid_finalized",
      payload: { songId, title: song.title, artist: song.artist, bidPower: power, rankScore: song.aiScore + song.boostScore },
    });
  }

  track({ event: "placement_bid_paid", userId, properties: { songId, amount: Number(amountUsd), placement, bidPower: power } });
  console.log(`[stripe-webhook] Placement bid finalized: song=${songId} user=${userId} power=${power}`);
}

async function handleLicenseCheckoutCompleted(session: Stripe.Checkout.Session) {
  const songId = session.metadata?.songId;
  const userId = session.metadata?.userId ?? session.metadata?.buyerId;
  if (!songId || !userId) return;

  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    include: { song: true },
  });
  if (!existing || existing.status === "SUCCEEDED") return;

  const song = existing.song;
  if (!song) {
    console.error("[stripe-webhook] License checkout: transaction has no associated song", session.id);
    return;
  }

  // Atomically reserve a slot. If two webhooks process concurrently, only the
  // one whose conditional update wins claims the next tokenNumber; the other
  // sees count=0 and bails out (Stripe will retry, and the next pass will see
  // the transaction already SUCCEEDED via the existing-check above).
  const reservation = await prisma.$transaction(async (tx) => {
    const reserved = await tx.song.updateMany({
      where: {
        id: song.id,
        soldLicenses: { lt: song.totalLicenses },
      },
      data: { soldLicenses: { increment: 1 } },
    });
    if (reserved.count === 0) {
      return null;
    }
    const updatedSong = await tx.song.findUnique({
      where: { id: song.id },
      select: { soldLicenses: true },
    });
    if (!updatedSong) return null;

    const newLicense = await tx.licenseToken.create({
      data: {
        tokenNumber: updatedSong.soldLicenses, // post-increment value
        price: existing.amount,
        songId: song.id,
        holderId: existing.userId,
      },
    });
    return newLicense;
  });

  // Best-effort first-sale email: send only when the artist's prior sold
  // count was 0 (we observed it on `song` before the increment). Fire and
  // forget so a slow Resend response doesn't delay the webhook.
  if (reservation && song.soldLicenses === 0) {
    void (async () => {
      try {
        const artist = await prisma.user.findUnique({
          where: { id: song.artistId },
          select: { email: true, name: true },
        });
        if (artist?.email) {
          await sendArtistMilestoneEmail({
            to: artist.email,
            artistName: artist.name ?? "there",
            kind: "first_sale",
            amountUsd: Number(existing.amount),
            songTitle: song.title,
          });
        }
      } catch (err) {
        console.warn("[stripe-webhook] first-sale email failed", err);
      }
    })();
  }

  // Buyer receipt email — fires whenever a license is successfully issued.
  // Same fire-and-forget pattern as the artist milestone above so a slow
  // Resend response never delays Stripe's webhook ack.
  if (reservation) {
    void (async () => {
      try {
        const buyer = await prisma.user.findUnique({
          where: { id: existing.userId },
          select: { email: true, name: true, emailVerified: true },
        });
        if (!buyer?.email) return;
        const { sendNotificationEmail } = await import("@/lib/email");
        const siteUrl = (await import("@/lib/site")).getSiteUrl();
        const amount = Number(existing.amount).toFixed(2);
        const subject = `Your license for "${song.title}" — receipt`;
        const html = `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fff;font-family:-apple-system,sans-serif;padding:40px 16px">
  <div style="max-width:540px;margin:0 auto;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:40px 32px">
    <h1 style="margin:0 0 12px;font-size:22px">Thanks for your license 🎟️</h1>
    <p style="color:rgba(255,255,255,0.7);line-height:1.6">
      You licensed <strong>${escapeHtml(song.title)}</strong> by <strong>${escapeHtml(song.artist)}</strong>
      for <strong>$${amount}</strong>.
    </p>
    <p style="color:rgba(255,255,255,0.7);line-height:1.6">
      Your license + download is available on your dashboard. The standard
      non-exclusive terms apply — see the agreement linked from the receipt page.
    </p>
    <p style="margin:24px 0">
      <a href="${siteUrl}/licenses/${reservation.id}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:700">Open receipt →</a>
    </p>
    <p style="color:rgba(255,255,255,0.4);font-size:11px;margin-top:32px">
      Transaction ID: ${existing.id}<br>
      License ID: ${reservation.id}<br>
      Questions? Reply to this email or visit ${siteUrl}/support.
    </p>
  </div></body></html>`;
        await sendNotificationEmail({
          to: buyer.email,
          subject,
          html,
          text: `Thanks for your license! "${song.title}" by ${song.artist} for $${amount}. Receipt: ${siteUrl}/licenses/${reservation.id}`,
        });
      } catch (err) {
        console.warn("[stripe-webhook] buyer receipt email failed", err);
      }
    })();
  }

  if (!reservation) {
    console.warn(
      "[stripe-webhook] license issuance refused — song sold out",
      { sessionId: session.id, songId: song.id },
    );

    // Auto-refund the buyer immediately. We have the payment_intent on the
    // session so we can issue the refund inline without a follow-up job.
    let refundId: string | null = null;
    let refundError: string | null = null;
    const paymentIntentId = session.payment_intent as string | undefined;
    if (paymentIntentId) {
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            reason: "requested_by_customer",
            metadata: {
              emsReason: "SOLD_OUT_AT_WEBHOOK",
              transactionId: existing.id,
              songId: song.id,
            },
          },
          { idempotencyKey: `refund-soldout-${existing.id}` },
        );
        refundId = refund.id;
      } catch (err) {
        refundError = err instanceof Error ? err.message : "unknown";
        console.error("[stripe-webhook] auto-refund failed", err);
      }
    }

    await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        status: "FAILED",
        metadata: {
          reason: "SOLD_OUT_AT_WEBHOOK",
          autoRefundId: refundId,
          autoRefundError: refundError,
        },
      },
    });

    // Notify the buyer so they're not staring at a successful Stripe receipt
    // without a license.
    try {
      await enqueueNotification({
        userId: existing.userId,
        type: "REFUND_ISSUED",
        title: "Refund issued — track sold out",
        body: `"${song.title}" sold out before we could issue your license. ${
          refundId
            ? "We've automatically refunded your payment in full."
            : "Please contact support to confirm your refund."
        }`,
        metadata: { songId: song.id, transactionId: existing.id, refundId },
      });
    } catch (err) {
      console.warn("[stripe-webhook] sold-out notification failed", err);
    }

    return;
  }
  const license = reservation;

  // License sale changed soldLicenses — bust home + track caches.
  revalidateTag(CACHE_TAGS.songs);
  revalidateTag(CACHE_TAGS.homepage);

  await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: "SUCCEEDED",
      stripePaymentIntentId: session.payment_intent as string | undefined,
      licenseTokenId: license.id,
    },
  });

  // Mirror into revenue ledger (idempotent — RevenueEvent.transactionId is unique)
  try {
    await recordLicenseSale({
      songId: song.id,
      artistId: song.artistId,
      transactionId: existing.id,
      grossDollars: Number(existing.amount),
      newBuyerId: existing.userId,
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      console.warn("[stripe-webhook] license ledger write failed", err);
    }
  }

  const revenueShare = Number(song.revenueSharePct) / 100;
  const payoutAmount = Number(existing.amount) * revenueShare;

  await prisma.payout.create({
    data: {
      amount: payoutAmount,
      userId: song.artistId,
      songId: song.id,
      licenseTokenId: license.id,
      period: "instant",
    },
  });

  const payoutRow = await prisma.payout.findFirst({
    where: { userId: song.artistId, songId: song.id, licenseTokenId: license.id },
    select: { id: true },
  });

  try {
    const artist = await prisma.user.findUnique({ where: { id: song.artistId } });
    if (artist?.stripeConnectId && payoutAmount > 0) {
      // Direct-charge + manual-transfer flow: the buyer's full payment lands
      // in the platform Stripe balance, and we transfer only the artist's
      // share. The remainder stays with the platform — that's our fee. No
      // application_fee_amount is needed (that's a destination-charges
      // concept). Idempotent via the transactionId in idempotencyKey so a
      // retried webhook doesn't double-pay.
      const idempotencyKey = `license-transfer:${existing.id}`;
      const transfer = await stripe.transfers.create(
        {
          amount: Math.round(payoutAmount * 100),
          currency: "usd",
          destination: artist.stripeConnectId,
          metadata: { songId: song.id, licenseId: license.id, transactionId: existing.id },
        },
        { idempotencyKey },
      );
      await prisma.payout.updateMany({
        where: { userId: artist.id, songId: song.id, licenseTokenId: license.id },
        data: { status: "PAID", paidAt: new Date(), stripeTransferId: transfer.id },
      });
    }
  } catch (err) {
    // Transfer failed — record the failure and queue an async retry. The
    // Payout row stays PENDING; the worker will flip it to PAID on success.
    // Same idempotency key on retry so Stripe collapses duplicates.
    console.error("[stripe-webhook] artist payout transfer failed", err);
    if (payoutRow && payoutAmount > 0) {
      await enqueuePayoutTransfer(
        {
          payoutId: payoutRow.id,
          transactionId: existing.id,
          artistId: song.artistId,
          amountCents: Math.round(payoutAmount * 100),
          songId: song.id,
          licenseTokenId: license.id,
          idempotencyKey: `license-transfer:${existing.id}`,
        },
        err instanceof Error ? err.message : "transfer_failed",
      );
    }
  }

  track({ event: "license_purchased", userId, properties: { songId, licenseId: license.id, amount: Number(existing.amount) } });
  console.log(`[stripe-webhook] License fulfilled: song=${songId} user=${userId} license=${license.id}`);
}

const TIER_MAP: Record<string, string> = { starter: "STARTER", pro: "PRO", prime: "PRIME", team: "TEAM", label: "LABEL_TIER" };
const PRICE_TO_TIER: Record<string, string> = {
  ...(process.env.STRIPE_PRICE_ID_STARTER ? { [process.env.STRIPE_PRICE_ID_STARTER]: "STARTER" } : {}),
  ...(process.env.STRIPE_PRICE_ID_PRO ? { [process.env.STRIPE_PRICE_ID_PRO]: "PRO" } : {}),
  ...(process.env.STRIPE_PRICE_ID_PRIME ? { [process.env.STRIPE_PRICE_ID_PRIME]: "PRIME" } : {}),
  ...(process.env.STRIPE_PRICE_ID_TEAM ? { [process.env.STRIPE_PRICE_ID_TEAM]: "TEAM" } : {}),
  ...(process.env.STRIPE_PRICE_ID_LABEL ? { [process.env.STRIPE_PRICE_ID_LABEL]: "LABEL_TIER" } : {}),
};
function getTierFromSubscription(sub: Stripe.Subscription) {
  for (const item of sub.items.data) {
    const tier = PRICE_TO_TIER[item.price.id];
    if (tier) return tier;
  }
  return null;
}
async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { userId, tier } = session.metadata ?? {};
  if (!userId || !tier) return;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const grossDollars = (session.amount_total ?? 0) / 100;
  await prisma.user.update({ where: { id: userId }, data: { subscriptionTier: (TIER_MAP[tier] ?? "STARTER") as never, ...(customerId ? { stripeCustomerId: customerId } : {}) } });
  const tx = await prisma.transaction.create({ data: { userId, amount: grossDollars, type: "SUBSCRIPTION", status: "SUCCEEDED", stripeSessionId: session.id, stripePaymentIntentId: subscriptionId ?? undefined, metadata: { stripeCustomerId: customerId, tier, subscriptionId } } });

  if (grossDollars > 0) {
    try {
      await recordSubscription({ userId, transactionId: tx.id, grossDollars });
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        console.warn("[stripe-webhook] subscription ledger write failed", err);
      }
    }
  }
}
async function handleSubscriptionChange(sub: Stripe.Subscription, eventType: string) {
  const customerId = sub.customer as string;
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (!user?.id) return;
  if (eventType === "customer.subscription.deleted" || sub.status === "canceled" || sub.status === "unpaid") {
    await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: "FREE" as never } });
    return;
  }
  const tier = getTierFromSubscription(sub);
  if (tier && ["active", "trialing"].includes(sub.status)) await prisma.user.update({ where: { id: user.id }, data: { subscriptionTier: tier as never } });
}
async function handleBoostCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { songId, userId, boostPoints } = session.metadata ?? {};
  if (!songId || !userId || !boostPoints) return;
  const existing = await prisma.transaction.findUnique({ where: { stripeSessionId: session.id } });
  if (existing?.status === "SUCCEEDED") return;
  const points = Number(boostPoints);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.song.update({ where: { id: songId }, data: { boostScore: { increment: points } } });
    return tx.transaction.update({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });
  });

  try {
    await recordBoost({ songId, buyerId: userId, transactionId: updated.id, grossDollars: Number(updated.amount) });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      console.warn("[stripe-webhook] boost ledger write failed", err);
    }
  }
}
async function handlePlacementPurchaseCompleted(session: Stripe.Checkout.Session) {
  const { songId, userId, boostScore } = session.metadata ?? {};
  if (!songId || !userId || !boostScore) {
    console.error("[stripe-webhook] PLACEMENT_PURCHASE missing metadata", session.metadata);
    return;
  }

  const existing = await prisma.transaction.findUnique({ where: { stripeSessionId: session.id } });
  if (existing?.status === "SUCCEEDED") return;

  const score = Number(boostScore);
  if (!Number.isFinite(score) || score <= 0) {
    console.error("[stripe-webhook] Invalid PLACEMENT_PURCHASE boostScore", boostScore);
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.song.update({ where: { id: songId }, data: { boostScore: { increment: score } } });
    return tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
      },
    });
  });

  try {
    await recordBoost({ songId, buyerId: userId, transactionId: updated.id, grossDollars: Number(updated.amount) });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      console.warn("[stripe-webhook] placement purchase ledger write failed", err);
    }
  }
}
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const tx = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    select: {
      id: true,
      userId: true,
      status: true,
      metadata: true,
    },
  });

  await prisma.transaction.updateMany({
    where: { stripeSessionId: session.id, status: "PENDING" },
    data: { status: "FAILED" },
  });

  const isAuctionWin =
    session.metadata?.type === "auction_win" ||
    ((tx?.metadata as { auctionId?: string } | null | undefined)?.auctionId != null);

  if (!isAuctionWin) return;

  const auctionId =
    session.metadata?.auctionId ??
    (tx?.metadata as { auctionId?: string } | null | undefined)?.auctionId;
  const sellerId =
    session.metadata?.sellerId ??
    ((tx?.metadata as { sellerId?: string } | null | undefined)?.sellerId ?? null);
  const winnerId = session.metadata?.userId ?? tx?.userId ?? null;

  if (auctionId) {
    await prisma.auction.updateMany({
      where: {
        id: auctionId,
        status: { in: ["ENDED", "ACTIVE"] },
      },
      data: { status: "EXPIRED", winnerId: null },
    });
  }

  await Promise.allSettled([
    winnerId
      ? enqueueNotification({
          userId: winnerId,
          type: "AUCTION_PAYMENT_EXPIRED",
          title: "Auction payment window expired",
          body: "Your winner checkout session expired before payment completed.",
          metadata: { auctionId, transactionId: tx?.id },
        })
      : Promise.resolve(),
    sellerId
      ? enqueueNotification({
          userId: sellerId,
          type: "AUCTION_EXPIRED",
          title: "Auction winner did not complete payment",
          body: "The winning bidder did not complete checkout within the payment window.",
          metadata: { auctionId, transactionId: tx?.id },
        })
      : Promise.resolve(),
  ]);
}
async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const updated = await prisma.transaction.updateMany({ where: { stripePaymentIntentId: pi.id }, data: { status: "FAILED" } });
  const tx = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: pi.id },
    select: { id: true, userId: true, songId: true, amount: true, type: true },
  });
  await recordRiskEvent({
    eventType: "failed_payment",
    severity: Number(pi.amount ?? 0) >= 50_000 ? "HIGH" : "MEDIUM",
    actorUserId: tx?.userId ?? null,
    songId: tx?.songId ?? null,
    transactionId: tx?.id ?? null,
    reason: pi.last_payment_error?.code ?? "payment_intent_failed",
    metadata: {
      paymentIntentId: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      transactionType: tx?.type ?? null,
      updatedCount: updated.count,
    },
  });
}
async function handleTipCheckoutCompleted(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });

  const txRow = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    select: { id: true, amount: true, userId: true, metadata: true },
  });
  const artistId = (txRow?.metadata as { artistId?: string } | null | undefined)?.artistId
    ?? session.metadata?.artistId;
  if (txRow && artistId) {
    try {
      await recordTip({
        artistId,
        transactionId: txRow.id,
        grossDollars: Number(txRow.amount),
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        console.warn("[stripe-webhook] tip ledger write failed", err);
      }
    }

    // First-tip milestone email — best-effort.
    void (async () => {
      try {
        const priorTipCount = await prisma.transaction.count({
          where: {
            type: "TIP",
            status: "SUCCEEDED",
            id: { not: txRow.id },
            metadata: { path: ["artistId"], equals: artistId },
          },
        });
        if (priorTipCount === 0) {
          const [artist, fan] = await Promise.all([
            prisma.user.findUnique({ where: { id: artistId }, select: { email: true, name: true } }),
            prisma.user.findUnique({ where: { id: txRow.userId }, select: { name: true } }),
          ]);
          if (artist?.email) {
            await sendArtistMilestoneEmail({
              to: artist.email,
              artistName: artist.name ?? "there",
              kind: "first_tip",
              amountUsd: Number(txRow.amount),
              followerName: fan?.name ?? "A fan",
            });
          }
        }
      } catch (err) {
        console.warn("[stripe-webhook] first-tip email failed", err);
      }
    })();
  }
}
async function handleAuctionWinCheckoutCompleted(session: Stripe.Checkout.Session) {
  const settled = await prisma.$transaction(async (tx) => {
    const txRow = await tx.transaction.findUnique({
      where: { stripeSessionId: session.id },
      select: {
        id: true,
        userId: true,
        amount: true,
        songId: true,
        status: true,
        metadata: true,
      },
    });
    if (!txRow) return null;

    // Idempotency: if this session was already fulfilled, avoid duplicate license issuance.
    if (txRow.status === "SUCCEEDED") return null;

    const auctionId =
      (txRow.metadata as { auctionId?: string } | null | undefined)?.auctionId ??
      session.metadata?.auctionId ??
      null;
    if (!auctionId) return null;

    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: {
        song: {
          select: {
            id: true,
            title: true,
            soldLicenses: true,
          },
        },
      },
    });
    if (!auction) return null;

    // Protect against fulfillment for the wrong user if metadata was tampered.
    if (auction.winnerId && auction.winnerId !== txRow.userId) {
      console.warn(
        `[stripe-webhook] auction winner mismatch: auction=${auction.id} winner=${auction.winnerId} txUser=${txRow.userId}`,
      );
      return null;
    }

    // Atomic settlement lock: flip auction status to SETTLED as the FIRST write
    // inside this transaction. If two webhook deliveries race past the outer
    // ProcessedWebhook dedupe (e.g., exactly simultaneous delivery), only one
    // will flip count === 1 here — the other returns null cleanly and Stripe
    // gets a 200, preventing a retry storm. This makes license issuance
    // idempotent at the database level.
    const settleRes = await tx.auction.updateMany({
      where: { id: auction.id, status: { not: "SETTLED" } },
      data: { status: "SETTLED", winnerId: txRow.userId, currentBid: txRow.amount },
    });
    if (settleRes.count !== 1) {
      // Another concurrent handler already claimed this auction.
      return null;
    }

    const maxTokenForSong = await tx.licenseToken.findFirst({
      where: { songId: auction.songId },
      orderBy: { tokenNumber: "desc" },
      select: { tokenNumber: true },
    });

    const licenseToken = await tx.licenseToken.create({
      data: {
        songId: auction.songId,
        holderId: txRow.userId,
        price: txRow.amount,
        tokenNumber: (maxTokenForSong?.tokenNumber ?? 0) + 1,
      },
      select: { id: true, tokenNumber: true },
    });

    await tx.song.update({
      where: { id: auction.songId },
      data: { soldLicenses: { increment: 1 } },
    });

    await tx.transaction.update({
      where: { id: txRow.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
        licenseTokenId: licenseToken.id,
      },
    });

    return {
      transactionId: txRow.id,
      grossAmount: Number(txRow.amount),
      songId: auction.songId ?? txRow.songId ?? null,
      sellerId: auction.sellerId,
      winnerId: txRow.userId,
      songTitle: auction.song.title,
      tokenNumber: licenseToken.tokenNumber,
      auctionId: auction.id,
    };
  });

  if (!settled) return;

  // Auction settlement changes listing availability and ranking projections.
  revalidateTag(CACHE_TAGS.songs);
  revalidateTag(CACHE_TAGS.homepage);

  try {
    await recordAuctionWin({
      songId: settled.songId,
      sellerId: settled.sellerId,
      transactionId: settled.transactionId,
      grossDollars: settled.grossAmount,
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      console.warn("[stripe-webhook] auction ledger write failed", err);
    }
  }

  await Promise.allSettled([
    enqueueNotification({
      userId: settled.winnerId,
      type: "AUCTION_WIN",
      title: "Auction payment confirmed ✅",
      body: settled.songTitle
        ? `Your payment for "${settled.songTitle}" was confirmed. License #${settled.tokenNumber} is now active.`
        : `Your auction payment was confirmed. License #${settled.tokenNumber} is now active.`,
      metadata: {
        auctionId: settled.auctionId,
        transactionId: settled.transactionId,
        tokenNumber: settled.tokenNumber,
      },
    }),
    enqueueNotification({
      userId: settled.sellerId,
      type: "AUCTION_SETTLED",
      title: "Auction settled and paid",
      body: settled.songTitle
        ? `Payment for "${settled.songTitle}" completed. The winning license has been delivered.`
        : "Auction payment completed. The winning license has been delivered.",
      metadata: {
        auctionId: settled.auctionId,
        transactionId: settled.transactionId,
        grossAmount: settled.grossAmount,
      },
    }),
  ]);
}
async function handleServicePurchaseCompleted(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  const providerId = session.metadata?.providerId;
  if (!orderId || !providerId) {
    console.error("[stripe-webhook] service_purchase missing metadata", session.metadata);
    return;
  }

  const txRow = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    select: { id: true, amount: true, status: true },
  });
  if (!txRow || txRow.status === "SUCCEEDED") return;

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: txRow.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
      },
    });
    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        stripePaymentIntentId: session.payment_intent as string | undefined,
      },
    });
    await tx.serviceListing.update({
      where: { id: (await tx.serviceOrder.findUnique({ where: { id: orderId }, select: { listingId: true } }))!.listingId },
      data: { totalSold: { increment: 1 } },
    });
  });

  try {
    await recordServiceSale({
      providerId,
      transactionId: txRow.id,
      grossDollars: Number(txRow.amount),
    });
  } catch (err) {
    if (!isUniqueConstraintError(err)) {
      console.warn("[stripe-webhook] service ledger write failed", err);
    }
  }

  // Notify provider that they have a new order
  try {
    await enqueueNotification({
      userId: providerId,
      type: "SERVICE_ORDER",
      title: "New service order 🎚️",
      body: `You have a new order — $${Number(txRow.amount).toFixed(2)}.`,
      metadata: { orderId },
    });
  } catch (err) {
    console.warn("[stripe-webhook] service order notification failed", err);
  }
}

async function handleAdPurchaseCompleted(session: Stripe.Checkout.Session) {
  const { adId, userId } = session.metadata ?? {};
  if (!adId || !userId) {
    console.error("[stripe-webhook] AD_PURCHASE missing metadata", session.metadata);
    return;
  }

  try {
    const result = await prisma.adPlacement.updateMany({
      where: { id: adId, ownerId: userId },
      data: { isActive: true },
    });

    if (result.count === 0) {
      console.warn(`[stripe-webhook] AD_PURCHASE: no matching ad found adId=${adId} userId=${userId}`);
      return;
    }

    // Mirror into revenue ledger
    const txRow = await prisma.transaction.findUnique({
      where: { stripeSessionId: session.id },
      select: { id: true, amount: true },
    });
    if (txRow) {
      try {
        await recordAdPurchase({
          buyerId: userId,
          adPlacementId: adId,
          transactionId: txRow.id,
          grossDollars: Number(txRow.amount),
        });
      } catch (err) {
        if (!isUniqueConstraintError(err)) {
          console.warn("[stripe-webhook] ad ledger write failed", err);
        }
      }
    }

    console.log(`[stripe-webhook] AD_PURCHASE: activated ad ${adId} for user ${userId}`);
  } catch (err) {
    console.error("[stripe-webhook] AD_PURCHASE: failed to activate ad", err);
    throw err;
  }
}
async function handleConnectAccountUpdated(account: Stripe.Account) {
  // Resolve the EMS user — prefer metadata, fall back to stripeConnectId lookup
  const emsUserId = account.metadata?.emsUserId;
  const whereClause = emsUserId
    ? { id: emsUserId }
    : { stripeConnectId: account.id };

  // Determine tax form status from country + verification state
  const taxFormStatus = resolveTaxFormStatus(account);

  await prisma.user.updateMany({
    where: whereClause,
    data: {
      stripeConnectId: account.id,
      connectChargesEnabled: account.charges_enabled,
      connectPayoutsEnabled: account.payouts_enabled,
      connectRequirements: account.requirements ? JSON.parse(JSON.stringify(account.requirements)) : null,
      connectCountry: account.country ?? null,
      taxFormStatus,
    },
  });

  console.log(
    `[stripe-webhook] account.updated: id=${account.id} charges=${account.charges_enabled} payouts=${account.payouts_enabled} country=${account.country} taxStatus=${taxFormStatus}`
  );
}

/**
 * Maps Stripe's account verification state to our internal TaxFormStatus.
 *
 * Rules:
 *  - If Stripe has not yet collected identity/tax info (requirements pending) → PENDING
 *  - If account is fully verified (details_submitted + no disabled_reason) → COLLECTED
 *  - Non-profits or manually marked exempt entities → EXEMPT
 *  - Default → NOT_COLLECTED
 */
function resolveTaxFormStatus(account: Stripe.Account): TaxFormStatus {
  if (!account.details_submitted) return TaxFormStatus.NOT_COLLECTED;

  const req = account.requirements;
  const hasPendingTaxFields =
    req?.currently_due?.some(
      (f) => f.includes("tax") || f.includes("ssn") || f.includes("id_number")
    ) ?? false;

  if (hasPendingTaxFields) return TaxFormStatus.PENDING;

  // Fully verified with no blocking requirements
  if (account.charges_enabled && account.payouts_enabled) return TaxFormStatus.COLLECTED;

  return TaxFormStatus.PENDING;
}

// ─── Refund / dispute / cancellation / customer deletion handlers ─────────

async function handleChargeRefunded(charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;

  // Find the transaction for this PI and mark it refunded.
  const transaction = await prisma.transaction.findFirst({
    where: piId ? { stripePaymentIntentId: piId } : { stripeSessionId: charge.id },
    select: { id: true, userId: true, songId: true, type: true, amount: true, status: true },
  });
  if (!transaction) {
    console.warn("[stripe-webhook] charge.refunded: no matching transaction", charge.id);
    return;
  }
  if (transaction.status === "REFUNDED") return;

  const fullyRefunded = charge.amount_refunded >= charge.amount;

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: fullyRefunded ? "REFUNDED" : "SUCCEEDED",
      metadata: {
        refundedAmount: charge.amount_refunded / 100,
        refundedAt: new Date().toISOString(),
        fullyRefunded,
      },
    },
  });

  // If a license-purchase transaction is fully refunded, revoke the license.
  if (fullyRefunded && transaction.type === "LICENSE_PURCHASE" && transaction.songId) {
    const txWithLicense = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      select: { licenseTokenId: true },
    });
    if (txWithLicense?.licenseTokenId) {
      await prisma.licenseToken.update({
        where: { id: txWithLicense.licenseTokenId },
        data: { status: "REVOKED" },
      });
    }
    await prisma.song.update({
      where: { id: transaction.songId },
      data: { soldLicenses: { decrement: 1 } },
    });
    revalidateTag(CACHE_TAGS.songs);
    revalidateTag(CACHE_TAGS.homepage);
  }

  // Mirror clawback into the revenue ledger so the wallet view reflects the
  // reversal (debit splits net the next payout).
  try {
    await recordRefund({
      transactionId: transaction.id,
      amountCents: charge.amount_refunded,
    });
  } catch (err) {
    console.warn("[stripe-webhook] refund ledger clawback failed", err);
  }

  // Fraud alert: page ops if refund rate over the last hour spikes above 5%
  // (with a min of 5 transactions to avoid false alerts on tiny samples).
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [refundedCount, totalCount] = await Promise.all([
      prisma.transaction.count({
        where: { status: "REFUNDED", updatedAt: { gte: oneHourAgo } },
      }),
      prisma.transaction.count({
        where: { status: { in: ["SUCCEEDED", "REFUNDED"] }, updatedAt: { gte: oneHourAgo } },
      }),
    ]);
    if (totalCount >= 5 && refundedCount / totalCount > 0.05) {
      page({
        severity: "critical",
        title: "[fraud-alert] Refund rate spike",
        body: `${(refundedCount / totalCount * 100).toFixed(1)}% (${refundedCount}/${totalCount}) over the last hour. Last refund: tx=${transaction.id} $${(charge.amount_refunded / 100).toFixed(2)}`,
        context: { refundedCount, totalCount, ratio: refundedCount / totalCount },
        fingerprint: "fraud-refund-rate-hour",
      });
      console.warn("[stripe-webhook] FRAUD_ALERT refund_rate", {
        refunded: refundedCount,
        total: totalCount,
        ratio: refundedCount / totalCount,
      });
    }
  } catch (err) {
    console.warn("[stripe-webhook] fraud rate check failed", err);
  }

  await enqueueNotification({
    userId: transaction.userId,
    type: "REFUND",
    title: "Refund processed",
    body: `$${(charge.amount_refunded / 100).toFixed(2)} was refunded.`,
    metadata: { transactionId: transaction.id },
  });
}

async function handleChargeDispute(dispute: Stripe.Dispute, eventType: string) {
  const piId = typeof dispute.payment_intent === "string"
    ? dispute.payment_intent
    : dispute.payment_intent?.id;
  if (!piId) return;

  const transaction = await prisma.transaction.findFirst({
    where: { stripePaymentIntentId: piId },
    select: { id: true, userId: true, songId: true, type: true },
  });
  if (!transaction) return;

  const isLost = dispute.status === "lost";
  const _isWon = dispute.status === "won";

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      // PaymentStatus has no DISPUTED state — keep SUCCEEDED while open and
      // flip to REFUNDED once a dispute is lost. The dispute metadata captures
      // the lifecycle for audit.
      status: isLost ? "REFUNDED" : "SUCCEEDED",
      metadata: {
        disputeId: dispute.id,
        disputeStatus: dispute.status,
        disputeReason: dispute.reason,
        eventType,
      },
    },
  });

  // Lost dispute on a license sale: revoke + decrement supply.
  if (isLost && transaction.type === "LICENSE_PURCHASE" && transaction.songId) {
    const txWithLicense = await prisma.transaction.findUnique({
      where: { id: transaction.id },
      select: { licenseTokenId: true },
    });
    if (txWithLicense?.licenseTokenId) {
      await prisma.licenseToken.update({
        where: { id: txWithLicense.licenseTokenId },
        data: { status: "REVOKED" },
      });
    }
    await prisma.song.update({
      where: { id: transaction.songId },
      data: { soldLicenses: { decrement: 1 } },
    });
    revalidateTag(CACHE_TAGS.songs);
    revalidateTag(CACHE_TAGS.homepage);
  }

  if (eventType === "charge.dispute.created") {
    await enqueueNotification({
      userId: transaction.userId,
      type: "DISPUTE",
      title: "Payment disputed",
      body: `A chargeback was filed on your transaction. Reason: ${dispute.reason}.`,
      metadata: { transactionId: transaction.id, disputeId: dispute.id },
    });
  }
}

async function handlePaymentIntentCanceled(pi: Stripe.PaymentIntent) {
  // PaymentStatus has no CANCELLED state — flip to FAILED with a metadata
  // hint so dashboards can distinguish a cancellation from a hard failure.
  await prisma.transaction.updateMany({
    where: { stripePaymentIntentId: pi.id, status: { not: "SUCCEEDED" } },
    data: {
      status: "FAILED",
      metadata: { canceled: true, cancellationReason: pi.cancellation_reason ?? null },
    },
  });
}

async function handleCustomerDeleted(customer: Stripe.Customer) {
  // Stripe customer was deleted. Clear our reference so future checkouts mint
  // a fresh customer; downgrade any active subscription to FREE.
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customer.id },
    select: { id: true },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: null,
      subscriptionTier: "FREE",
    },
  });
}

async function handleConnectAccountDeauthorized(connectedAccountId: string) {
  // The artist disconnected their Stripe Connect account from us.
  // Clear our copy of the connected-account id and the gating flags so the
  // dashboard tells them to reconnect before payouts can resume.
  await prisma.user.updateMany({
    where: { stripeConnectId: connectedAccountId },
    data: {
      stripeConnectId: null,
      connectChargesEnabled: false,
      connectPayoutsEnabled: false,
      connectRequirements: undefined,
    },
  });
}

async function handleVersusTipCompleted(session: Stripe.Checkout.Session) {
  const tipId = session.metadata?.tipId;
  if (!tipId) {
    console.error("[stripe-webhook] versus_tip missing tipId metadata", session.id);
    return;
  }

  const tip = await prisma.versusTip.findUnique({ where: { id: tipId } });
  if (!tip || tip.status === "PAID") return;

  await prisma.versusTip.update({
    where: { id: tip.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      stripePaymentIntentId: session.payment_intent as string | undefined,
    },
  });

  // Look up the match + both artists' Connect accounts.
  const match = await prisma.versusMatch.findUnique({
    where: { id: tip.matchId },
    include: {
      songA: { select: { artistId: true } },
      songB: { select: { artistId: true } },
    },
  });
  if (!match) return;

  // 50/50 split — winner-leaning bias is enforced by who the voter chose
  // (their pick gets the slightly nicer "voted-for" framing in the UI), but
  // payout is symmetric so neither artist gets shafted by a small tip.
  const totalAmount = Number(tip.amountUsd);
  const halfCents = Math.floor((totalAmount * 100) / 2);

  const [artistA, artistB] = await prisma.user.findMany({
    where: { id: { in: [match.songA.artistId, match.songB.artistId] } },
    select: { id: true, stripeConnectId: true },
  });

  await Promise.allSettled([
    artistA?.stripeConnectId
      ? stripe.transfers.create(
          {
            amount: halfCents,
            currency: "usd",
            destination: artistA.stripeConnectId,
            metadata: { kind: "versus_tip", tipId, matchId: tip.matchId },
          },
          { idempotencyKey: `versus-tip-transfer-${tipId}-A` },
        )
      : Promise.resolve(null),
    artistB?.stripeConnectId
      ? stripe.transfers.create(
          {
            amount: halfCents,
            currency: "usd",
            destination: artistB.stripeConnectId,
            metadata: { kind: "versus_tip", tipId, matchId: tip.matchId },
          },
          { idempotencyKey: `versus-tip-transfer-${tipId}-B` },
        )
      : Promise.resolve(null),
  ]);

  await Promise.allSettled([
    enqueueNotification({
      userId: match.songA.artistId,
      type: "VERSUS_TIP",
      title: `❤️ Tip received ($${(halfCents / 100).toFixed(2)})`,
      body: `A listener tipped both artists in your battle. Your share is in your Stripe Connect balance.`,
      metadata: { matchId: tip.matchId, tipId },
    }),
    enqueueNotification({
      userId: match.songB.artistId,
      type: "VERSUS_TIP",
      title: `❤️ Tip received ($${(halfCents / 100).toFixed(2)})`,
      body: `A listener tipped both artists in your battle. Your share is in your Stripe Connect balance.`,
      metadata: { matchId: tip.matchId, tipId },
    }),
  ]);
}

async function handleIdentityVerificationEvent(
  vs: Stripe.Identity.VerificationSession,
  eventType: string,
) {
  // Look up by stripeIdentitySessionId — the /api/stripe-connect/identity
  // route stamps the User row when it creates the session, and metadata
  // also carries userId as a belt-and-suspenders fallback.
  const userIdFromMetadata = (vs.metadata as { userId?: string } | undefined)?.userId;
  const user =
    userIdFromMetadata
      ? await prisma.user.findUnique({
          where: { id: userIdFromMetadata },
          select: { id: true, identityVerifiedAt: true },
        })
      : await prisma.user.findFirst({
          where: { stripeIdentitySessionId: vs.id },
          select: { id: true, identityVerifiedAt: true },
        });
  if (!user) {
    console.warn("[stripe-webhook] identity event for unknown user", {
      sessionId: vs.id,
      type: eventType,
    });
    return;
  }

  if (eventType === "identity.verification_session.verified") {
    // Idempotent — only stamp the verified-at on the first transition.
    if (!user.identityVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: { identityVerifiedAt: new Date() },
      });
      await enqueueNotification({
        userId: user.id,
        type: "IDENTITY_VERIFIED",
        title: "Identity verified ✅",
        body: "Your government-ID verification is on file. High-value payouts are now unlocked.",
      });
    }
  } else if (eventType === "identity.verification_session.canceled") {
    // Clear the linkage so a future attempt can mint a fresh session.
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeIdentitySessionId: null },
    });
  }
  // requires_input → no DB mutation; the Identity URL itself surfaces the
  // remediation step to the user.
}

// ─── Transfer / connected-payout reliability handlers ─────────────────────

/**
 * Transfer was reversed — the platform reclaimed funds from the artist
 * (typically after a refund/dispute). Flip Payout to FAILED so dashboards
 * stop showing "PAID" for funds the artist no longer has, and notify the
 * artist with the reason. The downstream refund/dispute handler already
 * adjusts the buyer side.
 */
async function handleTransferReversed(transfer: Stripe.Transfer) {
  const payout = await prisma.payout.findFirst({
    where: { stripeTransferId: transfer.id },
    select: { id: true, userId: true, amount: true, status: true, period: true },
  });
  if (!payout) {
    console.warn("[stripe-webhook] transfer.reversed for unknown transfer", transfer.id);
    return;
  }

  // amount_reversed equals amount when fully reversed.
  const fullyReversed = transfer.amount_reversed >= transfer.amount;

  await prisma.$transaction([
    prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: fullyReversed ? "FAILED" : "PAID",
      },
    }),
    prisma.payoutFailure.create({
      data: {
        payoutId: payout.id,
        userId: payout.userId,
        period: payout.period,
        amountCents: transfer.amount_reversed,
        reason: fullyReversed
          ? "transfer_reversed_full"
          : `transfer_reversed_partial:${transfer.amount_reversed}`,
      },
    }),
  ]);

  await enqueueNotification({
    userId: payout.userId,
    type: "PAYOUT_REVERSED",
    title: fullyReversed ? "Payout reversed" : "Partial payout reversal",
    body: fullyReversed
      ? `A previous $${Number(payout.amount).toFixed(2)} payout was reversed (typically after a refund or dispute). See your dashboard for the linked transaction.`
      : `Part of a previous payout was reversed: $${(transfer.amount_reversed / 100).toFixed(2)}.`,
    metadata: { payoutId: payout.id, transferId: transfer.id, amountReversedCents: transfer.amount_reversed },
  });
}

/**
 * Connected-account event: the artist's bank confirmed the deposit landed.
 * This is the single most artist-trust-building event we can surface. We
 * log it on the artist's notification feed so they get an actual receipt,
 * not just a number on a dashboard. (We don't track stripeBankPayoutId on
 * Payout today — adding a separate signal table would add surface; for
 * now the notification IS the receipt.)
 */
async function handleConnectPayoutPaid(payout: Stripe.Payout, connectedAccountId: string) {
  const user = await prisma.user.findUnique({
    where: { stripeConnectId: connectedAccountId },
    select: { id: true },
  });
  if (!user) return;

  const dollars = (payout.amount / 100).toFixed(2);
  const arrivalDate = payout.arrival_date
    ? new Date(payout.arrival_date * 1000).toLocaleDateString()
    : "today";

  await enqueueNotification({
    userId: user.id,
    type: "PAYOUT_LANDED",
    title: `$${dollars} just landed in your bank`,
    body: `Stripe confirmed your $${dollars} deposit arrived (expected ${arrivalDate}). It's in the bank account you connected.`,
    metadata: {
      stripePayoutId: payout.id,
      amountCents: payout.amount,
      arrivalDate: payout.arrival_date,
      currency: payout.currency,
    },
  });
}

/**
 * Connected-account event: the artist's bank rejected the deposit. This is
 * the #1 source of "where's my money?" tickets on every payout-driven
 * platform. We surface the precise reason from Stripe and a one-click path
 * to the dashboard where they can re-add their bank.
 */
async function handleConnectPayoutFailed(payout: Stripe.Payout, connectedAccountId: string) {
  const user = await prisma.user.findUnique({
    where: { stripeConnectId: connectedAccountId },
    select: { id: true, email: true },
  });
  if (!user) return;

  const reason =
    payout.failure_message ?? payout.failure_code ?? "Bank rejected the deposit.";
  const dollars = (payout.amount / 100).toFixed(2);

  // Page ops — bank rejections often need human follow-up if the artist
  // can't self-serve (e.g., closed account requires re-onboarding KYC).
  page({
    severity: "warn",
    title: `[payouts] connect payout.failed for ${user.id}`,
    body: `Bank rejected $${dollars} payout to ${connectedAccountId}: ${reason}. Artist notified.`,
    context: {
      userId: user.id,
      connectedAccountId,
      stripePayoutId: payout.id,
      reason,
      amountCents: payout.amount,
    },
    fingerprint: `payouts:connect-payout-failed:${payout.id}`,
  });

  await enqueueNotification({
    userId: user.id,
    type: "PAYOUT_BANK_REJECTED",
    title: `$${dollars} payout was bounced by your bank`,
    body: `Reason: ${reason}. Add or fix your bank in Earnings & Payouts — Stripe will retry automatically once it's updated.`,
    metadata: {
      stripePayoutId: payout.id,
      amountCents: payout.amount,
      reason,
      remediationPath: "/dashboard/payouts",
    },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
