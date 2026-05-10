import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { strictLimiter } from "@/lib/rateLimit";
import { getSiteUrl } from "@/lib/site";
import { checkoutMaintenanceResponse, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

export const runtime = "nodejs";

const schema = z.object({
  votedSongId: z.string().cuid(),
  amountUsd: z.number().int().min(1).max(500),
});

/**
 * POST /api/versus/[id]/tip
 *
 * Builds a Stripe checkout session that tips both artists in a versus match.
 * 50% to the artist whose track the user voted for (winner-leaning bias),
 * 50% to the other artist as consolation. Webhook records the actual VersusTip
 * row and dispatches transfers via Stripe Connect.
 *
 * Body: { votedSongId, amountUsd } — amountUsd in whole dollars.
 * Returns: { checkoutUrl, tipId }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`versus-tip:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down — too many tips in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { id: matchId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const match = await prisma.versusMatch.findUnique({
    where: { id: matchId },
    include: {
      songA: { select: { id: true, artistId: true } },
      songB: { select: { id: true, artistId: true } },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "ACTIVE" || match.endsAt < new Date()) {
    return NextResponse.json({ error: "Battle has ended." }, { status: 409 });
  }
  if (parsed.data.votedSongId !== match.songA.id && parsed.data.votedSongId !== match.songB.id) {
    return NextResponse.json({ error: "votedSongId must be one of the two songs." }, { status: 400 });
  }
  // Don't let an artist tip in their own battle.
  if (
    match.songA.artistId === session.user.id ||
    match.songB.artistId === session.user.id
  ) {
    return NextResponse.json(
      { error: "Artists can't tip in a battle featuring their own track." },
      { status: 403 },
    );
  }

  const tip = await prisma.versusTip.create({
    data: {
      matchId,
      voterId: session.user.id,
      votedSongId: parsed.data.votedSongId,
      amountUsd: parsed.data.amountUsd,
    },
  });

  const baseUrl = getSiteUrl();
  const stripeSession = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: parsed.data.amountUsd * 100,
            product_data: {
              name: `Tip with vote — Versus battle`,
              description: `Your tip splits 50/50 between both artists in this battle.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "versus_tip",
        tipId: tip.id,
        matchId,
        votedSongId: parsed.data.votedSongId,
        voterId: session.user.id,
      },
      success_url: `${baseUrl}/versus/${matchId}?tip=success`,
      cancel_url: `${baseUrl}/versus/${matchId}?tip=cancelled`,
    },
    { idempotencyKey: `versus-tip-${tip.id}` },
  );

  await prisma.versusTip.update({
    where: { id: tip.id },
    data: { stripeSessionId: stripeSession.id },
  });

  return NextResponse.json({ checkoutUrl: stripeSession.url, tipId: tip.id }, { status: 201 });
}
