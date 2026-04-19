import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import type Stripe from "stripe";

// Must run on Node.js runtime to read the raw request body for signature verification
export const runtime = "nodejs";

/**
 * POST /api/payments/webhook
 *
 * Stripe webhook endpoint. Register this URL in your Stripe dashboard:
 *   https://yourdomain.com/api/payments/webhook
 *
 * Events handled:
 *   checkout.session.completed  — fulfil license purchase or activate subscription
 *   customer.subscription.updated / deleted — track subscription lifecycle
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[payments/webhook] Invalid Stripe signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment") {
          await handleLicensePurchase(session);
        } else if (session.mode === "subscription") {
          await handleSubscriptionActivated(session);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(sub, event.type);
        break;
      }

      default:
        // Unhandled event types — acknowledge receipt without processing
        break;
    }
  } catch (err) {
    console.error("[payments/webhook] Handler error:", err);
    // Return 500 so Stripe retries the webhook
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// License purchase fulfillment
// ─────────────────────────────────────────────────────────────────────────────

async function handleLicensePurchase(session: Stripe.Checkout.Session) {
  const { songId, userId, quantity: quantityStr } = session.metadata ?? {};
  if (!songId || !userId) {
    console.error("[payments/webhook] Missing metadata on session", session.id);
    return;
  }

  // Idempotency: skip if already fulfilled
  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing?.status === "SUCCEEDED") return;

  const quantity = Math.max(1, Number(quantityStr ?? "1"));

  // Atomic transaction: mint license tokens + update song counter
  await prisma.$transaction(async (tx) => {
    const song = await tx.song.findUniqueOrThrow({ where: { id: songId } });

    const available = song.totalLicenses - song.soldLicenses;
    if (available < quantity) {
      throw new Error(`Insufficient licenses: need ${quantity}, have ${available}`);
    }

    // Mint each license token
    const tokens: { id: string; tokenNumber: number }[] = [];
    for (let i = 0; i < quantity; i++) {
      const tokenNumber = song.soldLicenses + i + 1;
      const token = await tx.licenseToken.create({
        data: {
          songId,
          holderId: userId,
          tokenNumber,
          price: song.licensePrice,
          status: "ACTIVE",
        },
        select: { id: true, tokenNumber: true },
      });
      tokens.push(token);
    }

    // Increment sold count
    await tx.song.update({
      where: { id: songId },
      data: { soldLicenses: { increment: quantity } },
    });

    // Mark transaction as succeeded (link first token for single purchases)
    await tx.transaction.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "SUCCEEDED",
        stripePaymentIntentId: session.payment_intent as string | undefined,
        licenseTokenId: tokens[0]?.id,
      },
    });

    // Notify buyer
    const tokenLabel =
      quantity === 1
        ? `license #${tokens[0]!.tokenNumber}`
        : `${quantity} licenses`;

    await enqueueNotification({
      userId,
      type: "LICENSE_PURCHASED",
      title: "License acquired! 🎵",
      body: `You now hold ${tokenLabel} for "${song.title}".`,
      metadata: { songId, tokens: tokens.map((t) => t.tokenNumber) },
    });

    // Notify artist
    await enqueueNotification({
      userId: song.artistId,
      type: "LICENSE_SOLD",
      title: "License sold! 💰",
      body: `${tokenLabel} of "${song.title}" ${quantity === 1 ? "was" : "were"} purchased.`,
      metadata: { songId, buyerId: userId, quantity },
    });
  });

  console.log(
    `[payments/webhook] License fulfilled: song=${songId} user=${userId} qty=${quantity}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription activation
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubscriptionActivated(session: Stripe.Checkout.Session) {
  const { userId, tier } = session.metadata ?? {};
  if (!userId || !tier) {
    console.error("[payments/webhook] Missing subscription metadata", session.id);
    return;
  }

  await prisma.transaction.create({
    data: {
      userId,
      amount: 0,
      type: "REVENUE_PAYOUT",
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
    body: `Your EMS ${tier} plan is now live.`,
    metadata: { tier },
  });

  console.log(`[payments/webhook] Subscription activated: user=${userId} tier=${tier}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription lifecycle changes
// ─────────────────────────────────────────────────────────────────────────────

async function handleSubscriptionChange(
  sub: Stripe.Subscription,
  eventType: string
) {
  const customerId = sub.customer as string;

  // Look up user by stored Stripe customer ID in transaction metadata
  const txRecord = await prisma.transaction.findFirst({
    where: { metadata: { path: ["stripeCustomerId"], equals: customerId } },
    select: { userId: true, metadata: true },
  });

  if (!txRecord) {
    console.warn(`[payments/webhook] No user for Stripe customer ${customerId}`);
    return;
  }

  const isCancelled =
    eventType === "customer.subscription.deleted" ||
    sub.status === "canceled" ||
    sub.status === "unpaid";

  if (isCancelled) {
    await enqueueNotification({
      userId: txRecord.userId,
      type: "SUBSCRIPTION_CANCELLED",
      title: "Subscription cancelled",
      body: "Your EMS subscription has ended. Re-subscribe any time from the pricing page.",
    });
  }

  console.log(
    `[payments/webhook] Subscription ${eventType}: customer=${customerId}`
  );
}
