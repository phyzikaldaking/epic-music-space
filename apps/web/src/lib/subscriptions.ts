// ─────────────────────────────────────────────────────────
// Subscription tier config
// Each STRIPE_PRICE_ID_* env var must point to a recurring
// price in your Stripe dashboard.
// ─────────────────────────────────────────────────────────

export const SUBSCRIPTION_TIERS = [
  {
    key: "starter",
    name: "Starter",
    description: "For listeners who want to participate in the EMS economy.",
    priceId: process.env.STRIPE_PRICE_ID_STARTER ?? "",
    monthlyUsd: 9,
    features: [
      "Unlimited song streaming",
      "Up to 5 active licenses",
      "Versus voting",
      "Basic leaderboard access",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    description: "For serious fans and emerging artists.",
    priceId: process.env.STRIPE_PRICE_ID_PRO ?? "",
    monthlyUsd: 29,
    features: [
      "Everything in Starter",
      "Up to 25 active licenses",
      "Song upload (up to 10 songs)",
      "AI score insights",
      "Studio profile + district badge",
    ],
  },
  {
    key: "prime",
    name: "Prime",
    description: "For professional artists building their brand.",
    priceId: process.env.STRIPE_PRICE_ID_PRIME ?? "",
    monthlyUsd: 79,
    features: [
      "Everything in Pro",
      "Unlimited licenses",
      "Unlimited song uploads",
      "Priority AI scoring",
      "Versus match creation",
      "Downtown Prime district access",
      "Analytics dashboard",
    ],
  },
  {
    key: "label",
    name: "Label",
    description: "Run your own music label and sign artists.",
    priceId: process.env.STRIPE_PRICE_ID_LABEL ?? "",
    monthlyUsd: 199,
    features: [
      "Everything in Prime",
      "Create & manage a label",
      "Sign up to 20 artists",
      "Label Row district access",
      "City billboard ad slots",
      "Stripe Connect payout dashboard",
      "Priority support",
    ],
  },
] as const;

export type SubscriptionTierKey = (typeof SUBSCRIPTION_TIERS)[number]["key"];
