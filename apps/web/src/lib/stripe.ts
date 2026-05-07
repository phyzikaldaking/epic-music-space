import type Stripe from "stripe";
import { assertStripeEnvironment } from "@/lib/stripeEnv";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  assertStripeEnvironment(process.env, { productionOnly: true });

  if (stripeClient) return stripeClient;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  // Defer the SDK require until first use so routes that never touch Stripe
  // don't pay the ~2.5MB cold-start cost.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeCtor = (require("stripe") as typeof import("stripe")).default;
  stripeClient = new StripeCtor(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  return stripeClient;
}

export function getStripeWebhookSecret() {
  assertStripeEnvironment(process.env, { productionOnly: true });

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  return webhookSecret;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop: keyof Stripe) {
    const value = getStripe()[prop];
    return typeof value === "function" ? value.bind(getStripe()) : value;
  },
});
