import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  songId: z.string().cuid(),
});

/**
 * POST /api/stripe-connect/payout
 *
 * Initiates a Stripe Transfer for unpaid song earnings to the artist's
 * connected account. This is a manual trigger — in production this would
 * be run by a scheduled BullMQ job.
 *
 * Revenue split:
 *   - Artist receives 90% of each license sale
 *   - Platform retains 10%
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
    select: { id: true, role: true, stripeConnectId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role === "LISTENER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!user.stripeConnectId) {
    return NextResponse.json(
      { error: "You must complete Stripe onboarding before requesting a payout." },
      { status: 402 }
    );
  }

  // Verify song belongs to this artist
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: { id: true, title: true, artistId: true, licensePrice: true, soldLicenses: true },
  });

  if (!song || song.artistId !== session.user.id) {
    return NextResponse.json({ error: "Song not found or not yours." }, { status: 404 });
  }

  // Sum up unpaid license sales for this song
  const pendingPayouts = await prisma.payout.findMany({
    where: { songId, userId: session.user.id, status: "PENDING" },
    include: { licenseToken: { select: { price: true } } },
  });

  if (pendingPayouts.length === 0) {
    return NextResponse.json({ error: "No pending earnings for this song." }, { status: 404 });
  }

  // Total pending amount
  const totalPendingCents = pendingPayouts.reduce((acc, p) => {
    const price = p.licenseToken ? Number(p.licenseToken.price) : Number(p.amount);
    // Artist gets 90%, platform keeps 10%
    const artistShare = Math.round(price * 0.9 * 100); // convert to cents
    return acc + artistShare;
  }, 0);

  if (totalPendingCents < 100) {
    return NextResponse.json(
      { error: "Minimum payout is $1.00. Accumulate more earnings first." },
      { status: 400 }
    );
  }

  // Create Stripe Transfer
  const transfer = await stripe.transfers.create({
    amount: totalPendingCents,
    currency: "usd",
    destination: user.stripeConnectId,
    metadata: {
      emsUserId: user.id,
      songId,
      payoutCount: pendingPayouts.length.toString(),
    },
  });

  // Mark payouts as PAID
  const now = new Date();
  await prisma.payout.updateMany({
    where: { id: { in: pendingPayouts.map((p) => p.id) } },
    data: { status: "PAID", paidAt: now },
  });

  return NextResponse.json({
    transferId: transfer.id,
    amountCents: totalPendingCents,
    payoutCount: pendingPayouts.length,
  });
}
