import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/stripe-connect/account
 *
 * Creates a Stripe Express connected account for the authenticated artist
 * and persists the account ID. Idempotent — returns existing account if
 * already created.
 *
 * Artists must complete the Stripe onboarding flow before payouts are sent.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, email: true, name: true, stripeConnectId: true },
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

  // Idempotent: return existing account ID
  if (user.stripeConnectId) {
    return NextResponse.json({ accountId: user.stripeConnectId });
  }

  const account = await stripe.accounts.create({
    type: "express",
    email: user.email ?? undefined,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { emsUserId: user.id },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { stripeConnectId: account.id },
  });

  return NextResponse.json({ accountId: account.id }, { status: 201 });
}

/**
 * GET /api/stripe-connect/account
 *
 * Returns the connected account status for the current user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeConnectId: true, role: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.stripeConnectId) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = await stripe.accounts.retrieve(user.stripeConnectId);
    const chargesEnabled = account.charges_enabled;
    const payoutsEnabled = account.payouts_enabled;
    const detailsSubmitted = account.details_submitted;

    return NextResponse.json({
      connected: true,
      accountId: user.stripeConnectId,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      onboardingComplete: chargesEnabled && payoutsEnabled && detailsSubmitted,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
