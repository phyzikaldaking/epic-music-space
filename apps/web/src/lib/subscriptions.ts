import type { SubscriptionTier } from "@ems/db";

export const subscriptionPriceEnv: Record<Exclude<SubscriptionTier, "FREE">, string> = {
  STARTER: "STRIPE_PRICE_STARTER",
  PRO: "STRIPE_PRICE_PRO",
  PRIME: "STRIPE_PRICE_PRIME",
  TEAM: "STRIPE_PRICE_TEAM",
  LABEL_TIER: "STRIPE_PRICE_LABEL_TIER",
};

export const subscriptionTiers: Array<{
  tier: SubscriptionTier;
  name: string;
  price: string;
  description: string;
  features: string[];
  highlight?: boolean;
}> = [
  {
    tier: "FREE",
    name: "Free",
    price: "$0/mo",
    description: "Browse the marketplace and start building your catalog intelligence.",
    features: ["Browse public marketplace", "Preview tracks", "Basic profile"],
  },
  {
    tier: "STARTER",
    name: "Starter",
    price: "$9/mo",
    description: "For new creators testing license drops and marketplace demand.",
    features: ["5 monthly license actions", "Starter studio tools", "Basic placement eligibility"],
  },
  {
    tier: "PRO",
    name: "Pro",
    price: "$29/mo",
    description: "For active artists releasing music and growing recurring demand.",
    features: ["25 monthly license actions", "Up to 10 songs", "Priority marketplace visibility"],
    highlight: true,
  },
  {
    tier: "PRIME",
    name: "Prime",
    price: "$49/mo",
    description: "For serious creators who want unlimited release leverage.",
    features: ["Unlimited creator access", "Premium analytics", "Advanced promotion tools"],
  },
  {
    tier: "TEAM",
    name: "Team",
    price: "$99/mo",
    description: "For teams, studios, and small creator groups operating together.",
    features: ["Collaborative workflow", "Team catalog visibility", "Shared release planning"],
  },
  {
    tier: "LABEL_TIER",
    name: "Label",
    price: "$199/mo",
    description: "For labels managing multiple artists, releases, and monetization lanes.",
    features: ["Label management", "Unlimited artist support", "Premium placement tools"],
  },
];

export function getStripePriceIdForTier(tier: SubscriptionTier) {
  if (tier === "FREE") return null;
  const envName = subscriptionPriceEnv[tier];
  return process.env[envName] ?? null;
}

export function getTierFromStripePriceId(priceId?: string | null): SubscriptionTier {
  if (!priceId) return "FREE";
  for (const [tier, envName] of Object.entries(subscriptionPriceEnv)) {
    if (process.env[envName] === priceId) return tier as SubscriptionTier;
  }
  return "FREE";
}
