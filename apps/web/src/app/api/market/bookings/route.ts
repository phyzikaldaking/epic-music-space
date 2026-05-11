import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { moderateLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { buildIdempotencyKey } from "@/lib/idempotency";
import {
  checkoutMaintenanceResponse,
  isCheckoutMaintenanceModeEnabled,
} from "@/lib/payments/checkoutMaintenance";

export const runtime = "nodejs";

// Book a verse listing. For LIVE_SESSION listings the buyer picks a
// startAt; for ASYNC_DELIVERY they just commit to a price. Either
// way, Stripe Checkout opens — payment is held in the platform
// account (no destination at checkout), and the stripe webhook for
// `session_booking` releases funds to the seller's Connect account
// once both parties sign off. 10% platform fee retained.

const createSchema = z.object({
  listingId: z.string().min(1).max(64),
  startAt: z.string().datetime().optional(),
  brief: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
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
    await moderateLimiter.consume(`market:book:ip:${ip}`);
    await moderateLimiter.consume(`market:book:user:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 4 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;
  const parsed = createSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { listingId, brief } = parsed.data;
  const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : null;

  const listing = await prisma.verseListing.findUnique({
    where: { id: listingId },
    include: {
      seller: {
        select: { id: true, name: true, username: true, stripeConnectId: true },
      },
    },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "Listing not available" }, { status: 410 });
  }
  if (listing.sellerId === session.user.id) {
    return NextResponse.json({ error: "You can't book your own verse." }, { status: 400 });
  }
  // LIVE_SESSION + ENGINEER_MIX both put two humans in a studio room
  // at the same time, so they share the timeslot rules.
  const isLiveKind =
    listing.kind === "LIVE_SESSION" || listing.kind === "ENGINEER_MIX";
  if (isLiveKind) {
    if (!startAt) {
      return NextResponse.json(
        { error: "Pick a session start time." },
        { status: 400 },
      );
    }
    if (startAt.getTime() < Date.now() + 15 * 60 * 1000) {
      return NextResponse.json(
        { error: "Sessions need at least 15 minutes lead time." },
        { status: 400 },
      );
    }
    // Prevent double-booking the same slot — refuse if the seller
    // already has a CONFIRMED/IN_PROGRESS booking that overlaps.
    const slotEnd = new Date(startAt.getTime() + listing.sessionMinutes * 60_000);
    const overlap = await prisma.sessionBooking.findFirst({
      where: {
        sellerId: listing.sellerId,
        status: { in: ["CONFIRMED", "IN_PROGRESS"] },
        startAt: {
          gte: new Date(startAt.getTime() - listing.sessionMinutes * 60_000),
          lt: slotEnd,
        },
      },
      select: { id: true },
    });
    if (overlap) {
      return NextResponse.json(
        { error: "Slot conflicts with another booking — pick a different time." },
        { status: 409 },
      );
    }
  }

  const amountCents = Math.round(Number(listing.priceUsd) * 100);
  // Pre-create the booking so we have an id to put in Stripe metadata
  // for the webhook reconciliation.
  const booking = await prisma.sessionBooking.create({
    data: {
      listingId: listing.id,
      buyerId: session.user.id,
      sellerId: listing.sellerId,
      startAt,
      agreedPriceUsd: listing.priceUsd,
      brief: brief ?? null,
    },
    select: { id: true },
  });

  const baseUrl = getSiteUrl();
  const idempotencyKey = buildIdempotencyKey(req, "market-booking-checkout", [
    session.user.id,
    listing.id,
    booking.id,
  ]);

  const stripeRes = await withRouteTimeout(
    "market-booking-stripe-checkout",
    4500,
    async () =>
      stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: amountCents,
                product_data: {
                  name:
                    listing.kind === "ENGINEER_MIX"
                      ? `🎚️ Mix session — ${listing.title}`
                      : listing.kind === "ENGINEER_MASTER"
                        ? `📡 Mastering delivery — ${listing.title}`
                        : isLiveKind
                          ? `🎤 Live session — ${listing.title}`
                          : `📼 Verse delivery — ${listing.title}`,
                  description: isLiveKind
                    ? `${listing.sessionMinutes}-minute live studio session with ${listing.seller.name ?? listing.seller.username ?? "engineer"}.`
                    : listing.kind === "ENGINEER_MASTER"
                      ? `Mastered stems delivered within ${listing.deliveryDays} days.`
                      : `Custom verse delivered within ${listing.deliveryDays} days.`,
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            type: "session_booking",
            bookingId: booking.id,
            listingId: listing.id,
            sellerId: listing.sellerId,
            buyerId: session.user.id,
          },
          success_url: `${baseUrl}/market/bookings/${booking.id}?paid=1`,
          cancel_url: `${baseUrl}/market/verses/${listing.id}`,
        },
        { idempotencyKey },
      ),
  );
  if (!stripeRes.ok) return stripeRes.response;
  const stripeSession = stripeRes.value;
  if (!stripeSession.url) {
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }

  await prisma.sessionBooking.update({
    where: { id: booking.id },
    data: { stripeSessionId: stripeSession.id },
  });

  return NextResponse.json(
    { checkoutUrl: stripeSession.url, bookingId: booking.id },
    { status: 201 },
  );
}

// GET /api/market/bookings — list the caller's bookings (as buyer or
// seller). The dashboard reads from here.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const bookings = await prisma.sessionBooking.findMany({
    where: {
      OR: [{ buyerId: session.user.id }, { sellerId: session.user.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      listing: { select: { id: true, title: true, kind: true } },
      buyer: { select: { id: true, name: true, username: true, image: true } },
      seller: { select: { id: true, name: true, username: true, image: true } },
    },
  });
  return NextResponse.json({ bookings });
}
