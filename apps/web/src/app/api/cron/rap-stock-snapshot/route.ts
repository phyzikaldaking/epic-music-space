import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { computeStockPrice, fetchArtistSignals } from "@/lib/rapStock";

export const runtime = "nodejs";
export const maxDuration = 60;

// Hourly snapshot of every eligible artist's composite stock price.
//
// "Eligible" = anyone PRO+ who has at least one active verse listing.
// We don't compute scores for artists who never listed because the
// formula reads 0 across the board and floods the table with empty
// rows. The /market page filters to ACTIVE listings anyway.
//
// We also prune snapshots older than 90 days at the end of each run
// so the table stays bounded. With ~hourly snapshots × 90 days that's
// ~2160 rows per active artist — fine at 10k artists, ~22M total.
export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (!cronGate.ok) return cronGate.response;

  const eligible = await prisma.user.findMany({
    where: {
      subscriptionTier: { in: ["PRO", "PRIME", "TEAM", "LABEL_TIER"] },
      verseListings: { some: { status: "ACTIVE" } },
    },
    select: { id: true },
    take: 5_000, // hard ceiling
  });

  let written = 0;
  let failed = 0;
  for (const artist of eligible) {
    try {
      const signals = await fetchArtistSignals(artist.id);
      const price = computeStockPrice(signals);
      await prisma.artistStockSnapshot.create({
        data: {
          artistId: artist.id,
          price,
          verseRevenue30d: signals.verseRevenue30d,
          avgVersePrice: signals.avgVersePrice,
          repeatBuyerRate: signals.repeatBuyerRate,
          bookings30d: signals.bookings30d,
          followerGrowth30d: signals.followerGrowth30d,
        },
      });
      written++;
    } catch (err) {
      console.warn("[rap-stock-snapshot] failed for", artist.id, err);
      failed++;
    }
  }

  // Prune > 90d rows.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const pruned = await prisma.artistStockSnapshot.deleteMany({
    where: { capturedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    ok: true,
    eligibleArtists: eligible.length,
    snapshotsWritten: written,
    failed,
    snapshotsPruned: pruned.count,
  });
}
