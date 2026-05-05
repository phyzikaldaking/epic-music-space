import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createSubscriptionCheckoutSession, SubscriptionCheckoutError } from "@/lib/payments/subscriptionCheckout";
import type { SubscriptionTier } from "@ems/db";

const schema = z.object({
  tier: z.string(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const tier = parsed.data.tier as SubscriptionTier;
  try {
    const checkout = await createSubscriptionCheckoutSession({
      cancelPath: "/pricing?subscription=cancelled",
      successPath: "/dashboard?subscription=success",
      tier,
      userId: session.user.id,
    });
    return NextResponse.json({ url: checkout.checkoutUrl });
  } catch (error) {
    if (error instanceof SubscriptionCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
