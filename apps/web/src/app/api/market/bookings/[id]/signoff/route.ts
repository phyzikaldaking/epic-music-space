import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { rateLimit } from "@/lib/rateLimitInline";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

// Both parties sign off when the session is done (or async delivery
// is accepted). The second signoff triggers the Stripe Connect
// transfer to the seller, minus the 10% platform fee.
//
// We require both sides to sign so neither can stall the other —
// a buyer who ghosts can't trap funds, and a seller who didn't
// deliver can't pull funds without buyer approval.

const PLATFORM_FEE_PCT = 0.10;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const blocked = await rateLimit("moderate", `market:signoff:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const booking = await prisma.sessionBooking.findUnique({
    where: { id },
  });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.status !== "CONFIRMED" && booking.status !== "IN_PROGRESS") {
    return NextResponse.json(
      { error: `Can't sign off when booking is ${booking.status}.` },
      { status: 409 },
    );
  }
  const isBuyer = booking.buyerId === session.user.id;
  const isSeller = booking.sellerId === session.user.id;
  if (!isBuyer && !isSeller) {
    return NextResponse.json({ error: "Not yours" }, { status: 403 });
  }

  const now = new Date();
  const updated = await prisma.sessionBooking.update({
    where: { id },
    data: {
      buyerSignedOffAt: isBuyer && !booking.buyerSignedOffAt ? now : booking.buyerSignedOffAt,
      sellerSignedOffAt: isSeller && !booking.sellerSignedOffAt ? now : booking.sellerSignedOffAt,
    },
  });

  // If both sides have now signed, complete + transfer.
  if (updated.buyerSignedOffAt && updated.sellerSignedOffAt) {
    const seller = await prisma.user.findUnique({
      where: { id: booking.sellerId },
      select: { stripeConnectId: true },
    });
    const totalCents = Math.round(Number(booking.agreedPriceUsd) * 100);
    const feeCents = Math.round(totalCents * PLATFORM_FEE_PCT);
    const payoutCents = totalCents - feeCents;
    let transferOk = true;
    if (seller?.stripeConnectId) {
      try {
        await stripe.transfers.create(
          {
            amount: payoutCents,
            currency: "usd",
            destination: seller.stripeConnectId,
            metadata: {
              kind: "session_booking",
              bookingId: booking.id,
              listingId: booking.listingId,
            },
          },
          { idempotencyKey: `session-booking-payout-${booking.id}` },
        );
      } catch (err) {
        console.warn("[market/signoff] transfer failed", err);
        transferOk = false;
      }
    } else {
      transferOk = false;
    }
    await prisma.sessionBooking.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
    await enqueueNotification({
      userId: booking.sellerId,
      type: "BOOKING_PAYOUT",
      title: transferOk
        ? `💰 $${(payoutCents / 100).toFixed(2)} on the way`
        : `Booking complete — payout pending`,
      body: transferOk
        ? `Session signed off. Funds en route to your Stripe Connect account.`
        : `Both sides signed off but the transfer didn't clear — complete your Stripe Connect onboarding and we'll retry.`,
      metadata: { bookingId: booking.id },
    });
    await enqueueNotification({
      userId: booking.buyerId,
      type: "BOOKING_COMPLETED",
      title: `🎤 Session complete`,
      body: `Thanks for booking — the artist's been paid out. Your receipt is in your account.`,
      metadata: { bookingId: booking.id },
    });
  } else {
    // Single-sided signoff — notify the other party so they know to
    // sign off too.
    const otherUserId = isBuyer ? booking.sellerId : booking.buyerId;
    await enqueueNotification({
      userId: otherUserId,
      type: "BOOKING_SIGNOFF_PENDING",
      title: `Other side signed off`,
      body: `Your collaborator marked the session complete — confirm to release the funds.`,
      metadata: { bookingId: booking.id },
    });
  }

  return NextResponse.json({
    ok: true,
    bothSignedOff: Boolean(updated.buyerSignedOffAt && updated.sellerSignedOffAt),
  });
}
