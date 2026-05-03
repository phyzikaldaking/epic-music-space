import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";

const APP_URL = getSiteUrl();

/**
 * GET /api/stripe-connect/kyc
 *
 * Returns the KYC / identity verification status for the authenticated artist.
 * If there are outstanding requirements, also returns a fresh Stripe account
 * link so the user can resolve them without starting over.
 *
 * Response shape:
 * {
 *   connected: boolean
 *   chargesEnabled: boolean
 *   payoutsEnabled: boolean
 *   detailsSubmitted: boolean
 *   kycStatus: "not_started" | "pending" | "action_required" | "verified"
 *   currentlyDue: string[]
 *   eventuallyDue: string[]
 *   errors: Array<{ code: string; reason: string; requirement: string }>
 *   disabledReason: string | null
 *   actionUrl: string | null   // fresh account link when action required
 * }
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      connectRequirements: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json({ error: "Listeners do not have payout accounts." }, { status: 403 });
  }

  if (!user.stripeConnectId) {
    return NextResponse.json({
      connected: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      kycStatus: "not_started",
      currentlyDue: [],
      eventuallyDue: [],
      errors: [],
      disabledReason: null,
      actionUrl: null,
    });
  }

  // Fetch live state from Stripe (requirements change after Stripe reviews documents)
  let stripeAccount: Awaited<ReturnType<typeof stripe.accounts.retrieve>>;
  try {
    stripeAccount = await stripe.accounts.retrieve(user.stripeConnectId);
  } catch {
    return NextResponse.json({ error: "Failed to retrieve account from Stripe." }, { status: 502 });
  }

  const req = stripeAccount.requirements;
  const currentlyDue: string[] = req?.currently_due ?? [];
  const eventuallyDue: string[] = req?.eventually_due ?? [];
  const disabledReason: string | null = req?.disabled_reason ?? null;
  const errors: Array<{ code: string; reason: string; requirement: string }> =
    (req?.errors ?? []).map((e) => ({
      code: e.code,
      reason: e.reason,
      requirement: e.requirement,
    }));

  // Derive KYC status
  let kycStatus: "not_started" | "pending" | "action_required" | "verified";
  if (!stripeAccount.details_submitted) {
    kycStatus = "not_started";
  } else if (currentlyDue.length > 0 || disabledReason) {
    kycStatus = "action_required";
  } else if (!stripeAccount.charges_enabled || !stripeAccount.payouts_enabled) {
    kycStatus = "pending"; // Submitted but Stripe still reviewing
  } else {
    kycStatus = "verified";
  }

  // Generate a fresh action link when the user needs to resolve requirements
  let actionUrl: string | null = null;
  if (kycStatus === "not_started" || kycStatus === "action_required") {
    try {
      const link = await stripe.accountLinks.create({
        account: user.stripeConnectId,
        refresh_url: `${APP_URL}/dashboard/payouts?kyc=refresh`,
        return_url: `${APP_URL}/dashboard/payouts?kyc=success`,
        type: "account_onboarding",
      });
      actionUrl = link.url;
    } catch {
      // Non-fatal — UI will fall back to the main onboarding button
    }
  }

  // Sync latest state to DB (avoid stale data if webhook was delayed)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      connectChargesEnabled: stripeAccount.charges_enabled,
      connectPayoutsEnabled: stripeAccount.payouts_enabled,
      connectRequirements: req ? JSON.parse(JSON.stringify(req)) : null,
    },
  });

  return NextResponse.json({
    connected: true,
    chargesEnabled: stripeAccount.charges_enabled,
    payoutsEnabled: stripeAccount.payouts_enabled,
    detailsSubmitted: stripeAccount.details_submitted,
    kycStatus,
    currentlyDue,
    eventuallyDue,
    errors,
    disabledReason,
    actionUrl,
  });
}
