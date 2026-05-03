import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  songId: z.string().cuid(),
});

// Minimum payout: $10 USD (1000 cents). Below this Stripe fees make transfers uneconomical.
const MIN_PAYOUT_CENTS = 1000;

/**
 * POST /api/stripe-connect/payout
 *
 * Initiates a Stripe Transfer for unpaid song earnings to the artist's
 * connected account with full compliance gates:
 *   1. Account must exist (stripeConnectId set)
 *   2. Account must have payouts_enabled (KYC + bank verified)
 *   3. Account must have no currently_due requirements (identity verified)
 *   4. Minimum payout threshold enforced ($10)
 *
 * Revenue split is stored per-payout record (set at license purchase time).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  const { songId } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      connectRequirements: true,
      connectCountry: true,
      taxFormStatus: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Gate 1: Stripe Connect account must exist ──────────────────────────
  if (!user.stripeConnectId) {
    return NextResponse.json(
      { error: "Complete Stripe Connect onboarding before requesting payouts.", code: "NO_CONNECT_ACCOUNT" },
      { status: 402 }
    );
  }

  // ── Gate 2: Payouts must be enabled on the connected account ──────────
  if (!user.connectPayoutsEnabled) {
    return NextResponse.json(
      {
        error: "Your account is not yet approved for payouts. Complete identity verification in your payout settings.",
        code: "PAYOUTS_DISABLED",
      },
      { status: 403 }
    );
  }

  // ── Gate 3: No pending KYC / identity requirements ────────────────────
  const requirements = user.connectRequirements as {
    currently_due?: string[];
    eventually_due?: string[];
    disabled_reason?: string | null;
    errors?: Array<{ code: string; reason: string; requirement: string }>;
  } | null;

  const currentlyDue = requirements?.currently_due ?? [];
  if (currentlyDue.length > 0) {
    return NextResponse.json(
      {
        error: "Action required: your Stripe account has pending verification requirements. Visit payout settings to resolve them.",
        code: "KYC_INCOMPLETE",
        requirements: currentlyDue,
      },
      { status: 403 }
    );
  }

  // ── Gate 4: Verify song belongs to this artist ────────────────────────
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, title: true, artistId: true },
  });

  if (!song || song.artistId !== session.user.id) {
    return NextResponse.json({ error: "Song not found or not yours." }, { status: 404 });
  }

  // ── Aggregate pending earnings ─────────────────────────────────────────
  const pendingPayouts = await prisma.payout.findMany({
    where: { songId, userId: session.user.id, status: "PENDING" },
  });

  if (pendingPayouts.length === 0) {
    return NextResponse.json({ error: "No pending earnings for this song." }, { status: 404 });
  }

  const totalPendingCents = pendingPayouts.reduce(
    (acc, p) => acc + Math.round(Number(p.amount) * 100),
    0
  );

  // ── Gate 5: Minimum payout threshold ──────────────────────────────────
  if (totalPendingCents < MIN_PAYOUT_CENTS) {
    return NextResponse.json(
      {
        error: `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}. You have $${(totalPendingCents / 100).toFixed(2)} pending.`,
        code: "BELOW_MINIMUM",
        pendingCents: totalPendingCents,
        minimumCents: MIN_PAYOUT_CENTS,
      },
      { status: 400 }
    );
  }

  // ── Create Stripe Transfer ─────────────────────────────────────────────
  const transfer = await stripe.transfers.create({
    amount: totalPendingCents,
    currency: "usd",
    destination: user.stripeConnectId,
    metadata: {
      emsUserId: user.id,
      songId,
      songTitle: song.title,
      payoutCount: pendingPayouts.length.toString(),
      payoutCountry: user.connectCountry ?? "unknown",
    },
  });

  // ── Mark payouts as PAID ───────────────────────────────────────────────
  await prisma.payout.updateMany({
    where: { id: { in: pendingPayouts.map((p) => p.id) } },
    data: { status: "PAID", paidAt: new Date() },
  });

  return NextResponse.json({
    transferId: transfer.id,
    amountCents: totalPendingCents,
    payoutCount: pendingPayouts.length,
  });
}
