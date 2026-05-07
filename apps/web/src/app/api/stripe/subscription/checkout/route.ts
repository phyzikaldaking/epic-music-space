import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSubscriptionCheckoutSession, SubscriptionCheckoutError } from "@/lib/payments/subscriptionCheckout";
import type { SubscriptionTier } from "@ems/db";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

const schema = z.object({
  tier: z.string(),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`stripe-subscription-checkout:user:${session.user.id}`);
    await strictLimiter.consume(`stripe-subscription-checkout:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tier = parsed.data.tier as SubscriptionTier;
  try {
    const checkoutResult = await withRouteTimeout("stripe-subscription-checkout-create", 4500, async () =>
      createSubscriptionCheckoutSession({
        cancelPath: "/pricing?subscription=cancelled",
        successPath: "/dashboard?subscription=success",
        tier,
        userId: session.user.id,
      }),
    );
    if (!checkoutResult.ok) return checkoutResult.response;

    const checkout = checkoutResult.value;
    return NextResponse.json({ url: checkout.checkoutUrl });
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
