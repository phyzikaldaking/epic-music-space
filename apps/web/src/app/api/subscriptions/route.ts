import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { SUBSCRIPTION_TIERS } from "@/lib/subscriptions";

const subscribeSchema = z.object({
  tier: z.enum(["starter", "pro", "prime", "label"]),
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
      { status: 429, headers: { "Retry-After": "60" } }
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
      { error: "Subscription tier not configured. Set STRIPE_PRICE_ID_* env vars." },
      { status: 503 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find Stripe customer ID from existing transactions
  const tx = await prisma.transaction.findFirst({
    where: { userId: session.user.id, stripePaymentIntentId: { not: null } },
    select: { metadata: true },
  });

  const customerId =
    tx?.metadata && typeof tx.metadata === "object" && "stripeCustomerId" in tx.metadata
      ? (tx.metadata as { stripeCustomerId?: string }).stripeCustomerId
      : undefined;

  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 404 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/dashboard`,
  });

  return NextResponse.json({ portalUrl: portal.url });
}
