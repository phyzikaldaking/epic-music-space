import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { withQueryBudget } from "@/lib/queryBudget";
import { computeRankingTransparency } from "@/lib/rankingTransparency";

const EDGE_CACHE_LISTINGS = "public, s-maxage=15, stale-while-revalidate=60";

function listingsCacheHeaders() {
  return {
    "Cache-Control": EDGE_CACHE_LISTINGS,
    "CDN-Cache-Control": EDGE_CACHE_LISTINGS,
    "Vercel-CDN-Cache-Control": EDGE_CACHE_LISTINGS,
  };
}

/**
 * GET /api/market/listings
 *
 * Returns all active song listings that still have licenses available.
 * Sorted by transparent score (organic factors + capped paid influence).
 * Results are Redis-cached for 15 s.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Serve from Redis cache when available
  const cached = await cacheGet<unknown[]>(CACHE_KEYS.listings);
  if (cached) {
    return NextResponse.json(cached, {
      headers: listingsCacheHeaders(),
    });
  }

  const allActive = await withQueryBudget(
    "market.listings.findMany",
    () =>
      prisma.song.findMany({
        where: { isActive: true, isLegacy: false },
        orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          title: true,
          artist: true,
          genre: true,
          coverUrl: true,
          licensePrice: true,
          revenueSharePct: true,
          totalLicenses: true,
          soldLicenses: true,
          aiScore: true,
          boostScore: true,
          streamCount: true,
          district: true,
          versusWins: true,
          versusLosses: true,
          createdAt: true,
        },
        take: 200,
      }),
    { warnAfterMs: 250, hardAfterMs: 1000, meta: { route: "market/listings" } },
  );

  const result = allActive
    .filter((s) => s.soldLicenses < s.totalLicenses)
    .map((song) => {
      const ranking = computeRankingTransparency({
        aiScore: Number(song.aiScore ?? 0),
        boostScore: Number(song.boostScore ?? 0),
        soldLicenses: song.soldLicenses,
        totalLicenses: song.totalLicenses,
        streamCount: song.streamCount,
        versusWins: song.versusWins,
        versusLosses: song.versusLosses,
        createdAt: song.createdAt,
      });
      return {
        ...song,
        rankScore: ranking.finalScore,
        paidBoostApplied: ranking.paidApplied,
        paidBoostCap: ranking.paidCap,
        paidInfluencePct: ranking.paidInfluencePct,
        paidBoostCapped: ranking.paidBoostCapped,
        rankingFactors: ranking.factors,
        availableLicenses: song.totalLicenses - song.soldLicenses,
        licensePrice: Number(song.licensePrice),
        revenueSharePct: Number(song.revenueSharePct),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 100);

  await cacheSet(CACHE_KEYS.listings, result, CACHE_TTL.listings);
  return NextResponse.json(result, {
    headers: listingsCacheHeaders(),
  });
}
