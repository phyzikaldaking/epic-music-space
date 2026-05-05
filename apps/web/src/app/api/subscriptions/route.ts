import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { createSubscriptionCheckoutSession, SubscriptionCheckoutError } from "@/lib/payments/subscriptionCheckout";
import type { SubscriptionTier } from "@ems/db";

const subscribeSchema = z.object({
  tier: z.enum(["starter", "pro", "prime", "team", "label"]),
});

const TIER_MAP: Record<z.infer<typeof subscribeSchema>["tier"], SubscriptionTier> = {
  starter: "STARTER",
  pro: "PRO",
  prime: "PRIME",
  team: "TEAM",
  label: "LABEL_TIER",
};

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

  try {
    const checkout = await createSubscriptionCheckoutSession({
      cancelPath: "/pricing",
      successPath: `/pricing?subscribed=${parsed.data.tier}`,
      tier: TIER_MAP[parsed.data.tier],
      userId: session.user.id,
    });
    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl });
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
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

  const baseUrl =
    (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const { stripe } = await import("@/lib/stripe");
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/dashboard`,
  });

  return NextResponse.json({ portalUrl: portal.url });
}
