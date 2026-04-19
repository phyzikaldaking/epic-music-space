import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
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
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
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

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────
// License purchase
// ─────────────────────────────────────────────────────────

async function handleLicenseCheckoutCompleted(session: Stripe.Checkout.Session) {
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

  // Atomic: increment soldLicenses and create license token
  await prisma.$transaction(async (tx) => {
    const song = await tx.song.findUniqueOrThrow({ where: { id: songId } });

    if (song.soldLicenses >= song.totalLicenses) {
      throw new Error("Song is sold out");
    }

    const tokenNumber = song.soldLicenses + 1;

    const [licenseToken] = await Promise.all([
      tx.licenseToken.create({
        data: {
          songId,
          holderId: userId,
          tokenNumber,
          price: song.licensePrice,
          status: "ACTIVE",
        },
      }),
      tx.song.update({
        where: { id: songId },
        data: { soldLicenses: { increment: 1 } },
      }),
    ]);

    await tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
        licenseTokenId: licenseToken.id,
      },
    });

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
      body: `License #${tokenNumber} of "${song.title}" was purchased.`,
      metadata: { songId, tokenNumber, buyerId: userId },
    });
  });

  console.log(`[stripe-webhook] License granted: song=${songId} user=${userId}`);
}

// ─────────────────────────────────────────────────────────
// Subscription purchase
// ─────────────────────────────────────────────────────────

async function handleSubscriptionCheckoutCompleted(
  session: Stripe.Checkout.Session
) {
  const { userId, tier } = session.metadata ?? {};
  if (!userId || !tier) {
    console.error("[stripe-webhook] Missing subscription metadata", session.metadata);
    return;
  }

  // Persist customer ID on the transaction record for the billing portal
  await prisma.transaction.create({
    data: {
      userId,
      amount: 0,
      type: "REVENUE_PAYOUT", // reuse existing enum; extend later for SUBSCRIPTION
      status: "SUCCEEDED",
      stripeSessionId: session.id,
      stripePaymentIntentId: session.subscription as string | null ?? undefined,
      metadata: {
        stripeCustomerId: session.customer as string,
        tier,
        subscriptionId: session.subscription,
      },
    },
  });

  await enqueueNotification({
    userId,
    type: "SUBSCRIPTION_ACTIVATED",
    title: `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan activated! 🚀`,
    body: `Welcome to EMS ${tier.charAt(0).toUpperCase() + tier.slice(1)}. Your new features are live.`,
    metadata: { tier },
  });

  console.log(`[stripe-webhook] Subscription activated: user=${userId} tier=${tier}`);
}

// ─────────────────────────────────────────────────────────
// Subscription lifecycle
// ─────────────────────────────────────────────────────────

async function handleSubscriptionChange(
  sub: Stripe.Subscription,
  eventType: string
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
    await enqueueNotification({
      userId: tx.userId,
      type: "SUBSCRIPTION_CANCELLED",
      title: "Subscription cancelled",
      body: "Your EMS subscription has ended. You can re-subscribe at any time from the pricing page.",
    });
  }

  console.log(`[stripe-webhook] Subscription ${eventType}: customer=${customerId}`);
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
    // Increment song's boostScore (cap at 100)
    const song = await tx.song.findUniqueOrThrow({ where: { id: songId } });
    const newBoostScore = Math.min(100, song.boostScore + points);

    await tx.song.update({
      where: { id: songId },
      data: { boostScore: newBoostScore },
    });

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
      metadata: { songId, boostPoints: points },
    });
  });

  console.log(`[stripe-webhook] Boost granted: song=${songId} user=${userId} points=${boostPoints}`);
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

  console.log(`[stripe-webhook] Checkout expired: session=${session.id} tx=${tx.id}`);
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
    metadata: { paymentIntentId: pi.id, failureCode: pi.last_payment_error?.code },
  });

  console.log(`[stripe-webhook] Payment failed: pi=${pi.id} tx=${tx.id}`);
}
