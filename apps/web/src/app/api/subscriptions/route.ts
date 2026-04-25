import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/site";

// ─────────────────────────────────────────────────────────
// Subscription tier config
// Each STRIPE_PRICE_ID_* env var must point to a recurring
// price in your Stripe dashboard.
// ─────────────────────────────────────────────────────────

const SUBSCRIPTION_TIERS = [
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
    monthlyUsd: 49,
    features: [
      "Everything in Pro",
      "Unlimited licenses",
      "Unlimited song uploads",
      "Priority AI scoring",
      "Versus match creation",
      "Mainstage Circuit access",
      "Analytics dashboard",
    ],
  },
  {
    key: "team",
    name: "Team",
    description: "For creative teams managing releases together.",
    priceId: process.env.STRIPE_PRICE_ID_TEAM ?? "",
    monthlyUsd: 99,
    features: [
      "Everything in Prime",
      "Team-ready release operations",
      "Shared artist workflow support",
      "Priority AI scoring queue",
      "Analytics dashboard",
      "Priority support",
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
      "Platinum Heights access",
      "City billboard ad slots",
      "Stripe Connect payout dashboard",
      "Priority support",
    ],
  },
] as const;

const subscribeSchema = z.object({
  tier: z.enum(["starter", "pro", "prime", "team", "label"]),
});

// POST /api/subscriptions — create Stripe Checkout session for a subscription
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const tier = SUBSCRIPTION_TIERS.find((t) => t.key === parsed.data.tier);
  if (!tier?.priceId) {
    return NextResponse.json(
      {
        error:
          "Subscription tier not configured. Set STRIPE_PRICE_ID_* env vars.",
      },
      { status: 503 },
    );
  }

  const baseUrl = getSiteUrl();

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: tier.priceId, quantity: 1 }],
    metadata: { userId: session.user.id, tier: tier.key },
    success_url: `${baseUrl}/pricing?subscribed=${tier.key}`,
    cancel_url: `${baseUrl}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ checkoutUrl: checkoutSession.url });
}

// GET /api/subscriptions — get Stripe billing portal URL for current user
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  const customerId =
    user?.stripeCustomerId ??
    (await prisma.transaction
      .findFirst({
        where: {
          userId: session.user.id,
          stripePaymentIntentId: { not: null },
        },
        select: { metadata: true },
      })
      .then((tx) =>
        tx?.metadata &&
        typeof tx.metadata === "object" &&
        "stripeCustomerId" in tx.metadata
          ? (tx.metadata as { stripeCustomerId?: string }).stripeCustomerId
          : undefined,
      ));

  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const baseUrl = getSiteUrl();

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/dashboard`,
  });

  return NextResponse.json({ portalUrl: portal.url });
}
