import { NextRequest, NextResponse } from "next/server";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { TaxFormStatus } from "@ems/db";
import { enqueueNotification } from "@/lib/queues";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { track } from "@/lib/analytics";
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

  await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      status: "SUCCEEDED",
      stripePaymentIntentId: session.payment_intent as string | undefined,
      licenseTokenId: license.id,
    },
  });

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
      await stripe.transfers.create({
        amount: Math.round(payoutAmount * 100),
        currency: "usd",
        destination: artist.stripeConnectId,
        metadata: { songId: song.id, licenseId: license.id },
      });
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
  await prisma.user.update({ where: { id: userId }, data: { subscriptionTier: (TIER_MAP[tier] ?? "STARTER") as never, ...(customerId ? { stripeCustomerId: customerId } : {}) } });
  await prisma.transaction.create({ data: { userId, amount: 0, type: "SUBSCRIPTION", status: "SUCCEEDED", stripeSessionId: session.id, stripePaymentIntentId: subscriptionId ?? undefined, metadata: { stripeCustomerId: customerId, tier, subscriptionId } } });
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
  await prisma.$transaction(async (tx) => {
    await tx.song.update({ where: { id: songId }, data: { boostScore: { increment: points } } });
    await tx.transaction.update({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });
  });
}
async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id, status: "PENDING" }, data: { status: "FAILED" } });
}
async function handlePaymentIntentFailed(pi: Stripe.PaymentIntent) {
  await prisma.transaction.updateMany({ where: { stripePaymentIntentId: pi.id }, data: { status: "FAILED" } });
}
async function handleTipCheckoutCompleted(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });
}
async function handleAuctionWinCheckoutCompleted(session: Stripe.Checkout.Session) {
  await prisma.transaction.updateMany({ where: { stripeSessionId: session.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: session.payment_intent as string | undefined } });
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
