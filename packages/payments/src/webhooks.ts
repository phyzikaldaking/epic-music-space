import { stripe } from "./stripe";
import type Stripe from "stripe";

export type WebhookHandler = (event: Stripe.Event) => Promise<void>;

/**
 * Verify and construct a Stripe webhook event from raw body + signature.
 */
export function constructWebhookEvent(
  body: string | Buffer,
  signature: string
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEvent(body, signature, secret);
}

/**
 * Central webhook dispatcher. Returns true if the event was handled.
 */
export async function handleWebhook(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "payment_intent.succeeded":
      await onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      return true;

    case "payment_intent.payment_failed":
      await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      return true;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await onSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return true;

    case "customer.subscription.deleted":
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return true;

    case "account.updated":
      await onConnectedAccountUpdated(event.data.object as Stripe.Account);
      return true;

    default:
      return false;
  }
}

async function onPaymentIntentSucceeded(intent: Stripe.PaymentIntent): Promise<void> {
  // TODO: Update Transaction status to COMPLETED in DB
  // TODO: Trigger any post-purchase fulfillment (e.g. send download link)
  const { productId } = intent.metadata ?? {};
  console.warn("[Webhook] payment_intent.succeeded", { intentId: intent.id, productId });
}

async function onPaymentIntentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  // TODO: Update Transaction status to FAILED in DB
  console.warn("[Webhook] payment_intent.payment_failed", { intentId: intent.id });
}

async function onSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  // TODO: Update Subscription record in DB with new tier + period end
  const tier = subscription.metadata?.tier;
  const periodEnd = new Date((subscription.current_period_end ?? 0) * 1000);
  console.warn("[Webhook] subscription updated", {
    subscriptionId: subscription.id,
    tier,
    periodEnd,
    status: subscription.status,
  });
}

async function onSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  // TODO: Set Subscription.isActive = false in DB
  console.warn("[Webhook] subscription deleted", { subscriptionId: subscription.id });
}

async function onConnectedAccountUpdated(account: Stripe.Account): Promise<void> {
  // TODO: Update User.stripeAccountId onboarding status in DB
  console.warn("[Webhook] connected account updated", {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  });
}
