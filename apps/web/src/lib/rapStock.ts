import { prisma } from "@/lib/prisma";

// Composite "stock price" for an artist on the rap stock market.
// Five weighted signals, normalised to a 0..500 share price. The
// number is intentionally not a dollar value — buyers pay the
// artist's listed verse price; the ticker is a *ranking* signal
// that surfaces who's hot.
//
// Weights (sum to 1.00):
//   40% verse_revenue_30d        — money actually moved this month
//   20% avg_verse_price          — what a verse fetches
//   15% repeat_buyer_rate        — how sticky the audience is
//   15% session_bookings_30d     — live demand
//   10% follower_growth_30d      — top-of-funnel momentum
//
// Each signal is normalised against a soft ceiling so the price
// curve is approximately log-shaped — a 10x-revenue artist trades
// 2x-3x their floor peers, not 10x. Keeps the leaderboard readable.

export interface StockSignals {
  /** Total verse-listing revenue (USD) the artist made in the last 30 days. */
  verseRevenue30d: number;
  /** Mean verse price across the artist's active listings. */
  avgVersePrice: number;
  /** Fraction (0..1) of buyers in last 90d who bought 2+ verses. */
  repeatBuyerRate: number;
  /** Number of confirmed (CONFIRMED, IN_PROGRESS, COMPLETED) session
   *  bookings in the last 30 days. */
  bookings30d: number;
  /** Net new followers in last 30 days. */
  followerGrowth30d: number;
}

const WEIGHTS = {
  verseRevenue30d: 0.40,
  avgVersePrice: 0.20,
  repeatBuyerRate: 0.15,
  bookings30d: 0.15,
  followerGrowth30d: 0.10,
} as const;

// Soft caps for each signal. We squash through log1p / (log1p(cap))
// so the max input maps to 1.0 and very small inputs aren't crushed
// to zero. Caps roughly model the "top 1% artist on the platform":
const SOFT_CAPS = {
  verseRevenue30d: 25_000,     // $25k/month is a serious feature artist
  avgVersePrice: 5_000,         // $5k/verse is A-list
  bookings30d: 40,              // 40 bookings/month = booked every weekend
  followerGrowth30d: 5_000,     // 5k followers/month = viral moment
} as const;

const MAX_PRICE = 500;

function softNormalize(value: number, cap: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const x = Math.min(value, cap * 4); // hard guardrail vs runaway inputs
  return Math.min(1, Math.log1p(x) / Math.log1p(cap));
}

export function computeStockPrice(signals: StockSignals): number {
  const components =
    WEIGHTS.verseRevenue30d * softNormalize(signals.verseRevenue30d, SOFT_CAPS.verseRevenue30d) +
    WEIGHTS.avgVersePrice * softNormalize(signals.avgVersePrice, SOFT_CAPS.avgVersePrice) +
    WEIGHTS.repeatBuyerRate * Math.max(0, Math.min(1, signals.repeatBuyerRate)) +
    WEIGHTS.bookings30d * softNormalize(signals.bookings30d, SOFT_CAPS.bookings30d) +
    WEIGHTS.followerGrowth30d * softNormalize(signals.followerGrowth30d, SOFT_CAPS.followerGrowth30d);
  return Math.round(components * MAX_PRICE * 100) / 100;
}

// Pull every signal for one artist from the DB. Used by the
// snapshot cron + by the artist ticker page for "live" price.
export async function fetchArtistSignals(artistId: string): Promise<StockSignals> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [revenue30dAgg, activeListings, buyer90d, bookingCount, followerGrowth] =
    await Promise.all([
      prisma.sessionBooking.aggregate({
        where: {
          sellerId: artistId,
          status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
          createdAt: { gte: since30 },
        },
        _sum: { agreedPriceUsd: true },
      }),
      prisma.verseListing.findMany({
        where: { sellerId: artistId, status: "ACTIVE" },
        select: { priceUsd: true },
      }),
      // 90-day buyer window — covers the repeat-rate calc below.
      prisma.sessionBooking.findMany({
        where: {
          sellerId: artistId,
          status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
          createdAt: { gte: since90 },
        },
        select: { buyerId: true },
      }),
      prisma.sessionBooking.count({
        where: {
          sellerId: artistId,
          status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
          createdAt: { gte: since30 },
        },
      }),
      prisma.userFollow.count({
        where: { followingId: artistId, createdAt: { gte: since30 } },
      }),
    ]);

  const verseRevenue30d = Number(revenue30dAgg._sum.agreedPriceUsd ?? 0);
  const avgVersePrice =
    activeListings.length > 0
      ? activeListings.reduce((sum, l) => sum + Number(l.priceUsd), 0) / activeListings.length
      : 0;

  // Repeat buyer rate: how many buyers in the 90d window have
  // bought 2+ times. Reads from the same dataset we already pulled.
  const byBuyer = new Map<string, number>();
  for (const b of buyer90d) {
    byBuyer.set(b.buyerId, (byBuyer.get(b.buyerId) ?? 0) + 1);
  }
  const totalBuyers = byBuyer.size;
  const repeatBuyers = Array.from(byBuyer.values()).filter((c) => c >= 2).length;
  const repeatBuyerRate = totalBuyers > 0 ? repeatBuyers / totalBuyers : 0;

  return {
    verseRevenue30d,
    avgVersePrice,
    repeatBuyerRate,
    bookings30d: bookingCount,
    followerGrowth30d: followerGrowth,
  };
}

/** One-shot helper: compute signals + price in a single call. */
export async function fetchArtistPrice(artistId: string): Promise<{
  signals: StockSignals;
  price: number;
}> {
  const signals = await fetchArtistSignals(artistId);
  return { signals, price: computeStockPrice(signals) };
}

/** Pull the last 30 days of snapshots for an artist, for the
 *  sparkline on the ticker page. Returns most-recent first. */
export async function fetchArtistSparkline(
  artistId: string,
  days = 30,
): Promise<Array<{ atSec: number; price: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.artistStockSnapshot.findMany({
    where: { artistId, capturedAt: { gte: since } },
    orderBy: { capturedAt: "asc" },
    select: { capturedAt: true, price: true },
  });
  return rows.map((r) => ({
    atSec: Math.floor(r.capturedAt.getTime() / 1000),
    price: Number(r.price),
  }));
}
