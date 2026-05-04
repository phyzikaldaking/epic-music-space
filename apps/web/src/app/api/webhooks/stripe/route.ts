import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { TaxFormStatus } from "@ems/db";
import { enqueueNotification } from "@/lib/queues";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { recordLicenseSale, recordTip, recordAdPurchase, recordRefund, recordAuctionWin, recordBoost, recordSubscription, recordServiceSale } from "@/lib/revenueShare";
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
    if (String((err as Error)?.message ?? "").includes("Unique constraint")) {
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
        else if (sessionType === "boost") await handleBoostCheckoutCompleted(session);
        else if (sessionType === "tip") await handleTipCheckoutCompleted(session);
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
  const { songId, userId } = session.metadata ?? {};
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

  const license = await prisma.licenseToken.create({
    data: {
      tokenNumber: song.soldLicenses + 1,
      price: existing.amount,
      songId: song.id,
      holderId: existing.userId,
    },
  });

  await prisma.song.update({
    where: { id: song.id },
    data: { soldLicenses: { increment: 1 } },
  });

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
    });
  } catch (err) {
    if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
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

  try {
    const artist = await prisma.user.findUnique({ where: { id: song.artistId } });
    if (artist?.stripeConnectId && payoutAmount > 0) {
      // Direct-charge + manual-transfer flow: the buyer's full payment lands
      // in the platform Stripe balance, and we transfer only the artist's
      // share. The remainder stays with the platform — that's our fee. No
      // application_fee_amount is needed (that's a destination-charges
      // concept). Idempotent via the transactionId in idempotencyKey so a
      // retried webhook doesn't double-pay.
      await stripe.transfers.create(
        {
          amount: Math.round(payoutAmount * 100),
          currency: "usd",
          destination: artist.stripeConnectId,
          metadata: { songId: song.id, licenseId: license.id, transactionId: existing.id },
        },
        { idempotencyKey: `license-transfer:${existing.id}` },
      );
      await prisma.payout.updateMany({
        where: { userId: artist.id, songId: song.id, licenseTokenId: license.id },
        data: { status: "PAID", paidAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[stripe-webhook] artist payout transfer failed", err);
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
      if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
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
    if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
      console.warn("[stripe-webhook] boost ledger write failed", err);
    }
  }
}
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id, status: "PENDING" }, data: { status: "FAILED" } });
}
async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  await prisma.transaction.updateMany({ where: { stripePaymentIntentId: pi.id }, data: { status: "FAILED" } });
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
      if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
        console.warn("[stripe-webhook] tip ledger write failed", err);
      }
    }
  }
}
async function handleAuctionWinCheckoutCompleted(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });

  // Look up the auction to find seller + song so we can credit the seller.
  const txRow = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
    select: { id: true, amount: true, songId: true, metadata: true },
  });
  const auctionId = (txRow?.metadata as { auctionId?: string } | null | undefined)?.auctionId
    ?? session.metadata?.auctionId;
  if (!txRow || !auctionId) return;

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { sellerId: true, songId: true },
  });
  if (!auction) return;

  try {
    await recordAuctionWin({
      songId: auction.songId ?? txRow.songId ?? null,
      sellerId: auction.sellerId,
      transactionId: txRow.id,
      grossDollars: Number(txRow.amount),
    });
  } catch (err) {
    if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
      console.warn("[stripe-webhook] auction ledger write failed", err);
    }
  }
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
    if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
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
        if (!String((err as Error)?.message ?? "").includes("Unique constraint")) {
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
      const webhook = process.env.AUTH_ALERT_WEBHOOK_URL;
      if (webhook) {
        fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[fraud-alert] Refund rate ${(refundedCount / totalCount * 100).toFixed(1)}% (${refundedCount}/${totalCount}) over the last hour. Last refund: tx=${transaction.id} $${(charge.amount_refunded / 100).toFixed(2)}`,
          }),
        }).catch(() => {});
      }
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
