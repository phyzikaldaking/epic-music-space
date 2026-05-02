import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { getStripePriceIdForTier } from "@/lib/subscriptions";
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
  const priceId = getStripePriceIdForTier(tier);

  if (!priceId) {
    return NextResponse.json({ error: "Invalid subscription tier" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { emsUserId: user.id },
    });

    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const siteUrl = getSiteUrl();

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/dashboard?subscription=success`,
    cancel_url: `${siteUrl}/pricing?subscription=cancelled`,
    metadata: {
      emsType: "SUBSCRIPTION",
      userId: user.id,
      tier,
    },
  });

  return NextResponse.json({ url: checkout.url });
}
