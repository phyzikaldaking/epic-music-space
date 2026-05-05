import Stripe from "stripe";
import { assertStripeEnvironment } from "@/lib/stripeEnv";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
let stripeClient: Stripe | null = null;

export function getStripe() {
  assertStripeEnvironment(process.env, { productionOnly: true });

  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  stripeClient ??= new Stripe(stripeSecretKey, {
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
