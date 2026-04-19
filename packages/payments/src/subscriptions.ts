import { stripe } from "./stripe";
import type Stripe from "stripe";

export enum SubscriptionTier {
  STARTER = "STARTER",
  PRO = "PRO",
  PRIME = "PRIME",
}

/** Map subscription tiers to Stripe Price IDs (set in env) */
export const SUBSCRIPTION_PRICE_IDS: Record<SubscriptionTier, string> = {
  [SubscriptionTier.STARTER]: process.env.STRIPE_PRICE_STARTER ?? "",
  [SubscriptionTier.PRO]: process.env.STRIPE_PRICE_PRO ?? "",
  [SubscriptionTier.PRIME]: process.env.STRIPE_PRICE_PRIME ?? "",
};

/** Dollar amounts per tier for display/reference */
export const SUBSCRIPTION_PRICES: Record<SubscriptionTier, number> = {
  [SubscriptionTier.STARTER]: 9,
  [SubscriptionTier.PRO]: 29,
  [SubscriptionTier.PRIME]: 99,
};

/**
 * Create a Stripe customer for a user.
 */
export async function createCustomer(email: string, name?: string): Promise<Stripe.Customer> {
  return stripe.customers.create({ email, name });
}

/**
 * Create a subscription for a customer.
 */
export async function createSubscription(
  customerId: string,
  tier: SubscriptionTier
): Promise<Stripe.Subscription> {
  const priceId = SUBSCRIPTION_PRICE_IDS[tier];
  if (!priceId) {
    throw new Error(`Stripe Price ID not configured for tier: ${tier}`);
  }

  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: { tier },
  });
}

/**
 * Cancel a subscription immediately.
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.cancel(subscriptionId);
}

/**
 * Update a subscription to a new tier.
 */
export async function updateSubscriptionTier(
  subscriptionId: string,
  newTier: SubscriptionTier
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = SUBSCRIPTION_PRICE_IDS[newTier];
  if (!priceId) {
    throw new Error(`Stripe Price ID not configured for tier: ${newTier}`);
  }

  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0]?.id,
        price: priceId,
      },
    ],
    metadata: { tier: newTier },
    proration_behavior: "always_invoice",
  });
}

/**
 * Create a billing portal session so users can manage their subscription.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
