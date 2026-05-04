import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { strictLimiter } from "@/lib/rateLimit";

const APP_URL = getSiteUrl();

/**
 * GET /api/stripe-connect/onboarding
 *
 * Generates a Stripe Account Link URL for the Express onboarding flow.
 * Creates the connected account first if one doesn't exist yet.
 *
 * Returns: { url: string }
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Hard rate limit — prevents a stuck client from creating a stream of Stripe
  // accounts via repeated GET-on-mount calls.
  try {
    await strictLimiter.consume(`stripe-connect:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many onboarding attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  void req;

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

  // Create account if needed. Two concurrent GETs from the same user could
  // both pass the !connectId check and both create accounts. We use a
  // conditional update — only the first one wins, and the loser deletes its
  // orphaned Stripe account before continuing.
  let connectId = user.stripeConnectId;
  if (!connectId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { emsUserId: user.id },
    });

    const updated = await prisma.user.updateMany({
      where: { id: user.id, stripeConnectId: null },
      data: { stripeConnectId: account.id },
    });

    if (updated.count === 1) {
      connectId = account.id;
    } else {
      // Another request created an account first — clean up our orphan.
      try {
        await stripe.accounts.del(account.id);
      } catch (err) {
        console.warn("[stripe-connect] orphan account cleanup failed", err);
      }
      const refreshed = await prisma.user.findUnique({
        where: { id: user.id },
        select: { stripeConnectId: true },
      });
      connectId = refreshed?.stripeConnectId ?? null;
    }

    if (!connectId) {
      return NextResponse.json(
        { error: "Could not initialize Stripe Connect. Please retry." },
        { status: 500 },
      );
    }
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
