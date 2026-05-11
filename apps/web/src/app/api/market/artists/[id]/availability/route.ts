import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Returns the booked time slots for an artist over the next N days
// so the booking modal can grey out conflicts. We don't expose a
// per-artist "calendar of availability" yet — by default the artist
// is available 7 days a week, 24h a day, *unless* a slot conflicts.
// Real calendars / blackout windows are a follow-up.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get("days") ?? "14")));
  const from = new Date();
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const bookings = await prisma.sessionBooking.findMany({
    where: {
      sellerId: id,
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
      startAt: { gte: from, lt: until },
    },
    orderBy: { startAt: "asc" },
    include: {
      listing: { select: { sessionMinutes: true } },
    },
  });

  return NextResponse.json({
    blocked: bookings
      .filter((b) => b.startAt)
      .map((b) => ({
        startAt: b.startAt!.toISOString(),
        durationMinutes: b.listing.sessionMinutes,
      })),
  });
}
