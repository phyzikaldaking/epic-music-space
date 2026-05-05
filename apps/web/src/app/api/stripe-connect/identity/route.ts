import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * POST /api/stripe-connect/identity
 *
 * Creates a Stripe Identity verification session for the caller and
 * returns a hosted URL the user opens to upload ID + selfie. We store
 * the session id on the User row; the stripe webhook flips
 * identityVerifiedAt when `identity.verification_session.verified` fires.
 *
 * Use case: a stronger KYC layer than Stripe Express's onboarding for
 * artists about to receive high-value payouts. Express collects tax
 * forms and bank info; Identity adds government-issued document
 * verification with selfie matching. Required gate is enforced by the
 * payout cron, not this endpoint — this just kicks off the flow.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`identity:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many verification attempts. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      stripeIdentitySessionId: true,
      identityVerifiedAt: true,
    },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.identityVerifiedAt) {
    return NextResponse.json({
      ok: true,
      verified: true,
      message: "Identity already verified.",
    });
  }

  const siteUrl = getSiteUrl();
  const verificationSession = await stripe.identity.verificationSessions.create({
    type: "document",
    metadata: { userId: me.id },
    options: {
      document: {
        require_id_number: false,
        require_live_capture: true,
        require_matching_selfie: true,
      },
    },
    return_url: `${siteUrl}/dashboard/payouts?identity=complete`,
  });

  await prisma.user.update({
    where: { id: me.id },
    data: { stripeIdentitySessionId: verificationSession.id },
  });

  return NextResponse.json({
    ok: true,
    url: verificationSession.url,
  });
}
