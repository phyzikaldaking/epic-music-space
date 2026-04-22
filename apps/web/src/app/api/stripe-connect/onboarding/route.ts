import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";

const APP_URL = getSiteUrl();

/**
 * GET /api/stripe-connect/onboarding
 *
 * Generates a Stripe Account Link URL for the Express onboarding flow.
 * Creates the connected account first if one doesn't exist yet.
 *
 * Returns: { url: string }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, email: true, stripeConnectId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json(
      { error: "Only artists and labels can set up payouts." },
      { status: 403 }
    );
  }

  // Create account if needed
  let connectId = user.stripeConnectId;
  if (!connectId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { emsUserId: user.id },
    });
    connectId = account.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeConnectId: connectId },
    });
  }

  // Generate onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: connectId,
    refresh_url: `${APP_URL}/dashboard?connect=refresh`,
    return_url:  `${APP_URL}/dashboard?connect=success`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
