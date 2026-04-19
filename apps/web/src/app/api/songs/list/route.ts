import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";

/**
 * GET /api/songs/list
 *
 * Returns active songs. Supports query params:
 *   ?genre=hip-hop   — filter by genre (case-insensitive)
 *   ?search=keyword  — search by title or artist name (case-insensitive)
 *   ?sort=trending   — trending (ai score desc, default)
 *                    — newest (createdAt desc)
 *                    — price_asc / price_desc (by licensePrice)
 *                    — rev_desc (highest revenue share first)
 *   ?limit=20        — override default take (max 100)
 *
 * Unfiltered trending results are Redis-cached for 30 s.
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

  const { searchParams } = new URL(req.url);
  const genre = searchParams.get("genre");
  const search = searchParams.get("search")?.trim() ?? "";
  const sort = searchParams.get("sort") ?? "trending";
  const rawLimit = Number(searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(1, rawLimit), 100);

  // Only cache when no filters are applied
  const isUnfiltered = !genre && !search && sort === "trending";
  if (isUnfiltered) {
    const cached = await cacheGet<unknown[]>(CACHE_KEYS.trendingSongs);
    if (cached) return NextResponse.json(cached.slice(0, limit));
  }

  // Build orderBy based on sort param
  type SongOrderBy =
    | { aiScore: "desc" }
    | { createdAt: "desc" }
    | { licensePrice: "asc" }
    | { licensePrice: "desc" }
    | { revenueSharePct: "desc" };

  const orderBy: SongOrderBy[] =
    sort === "newest"     ? [{ createdAt: "desc" }]
    : sort === "price_asc"  ? [{ licensePrice: "asc" }, { aiScore: "desc" }]
    : sort === "price_desc" ? [{ licensePrice: "desc" }, { aiScore: "desc" }]
    : sort === "rev_desc"   ? [{ revenueSharePct: "desc" }, { aiScore: "desc" }]
    : /* trending */          [{ aiScore: "desc" }, { createdAt: "desc" }];

  const songs = await prisma.song.findMany({
    where: {
      isActive: true,
      ...(genre ? { genre: { equals: genre, mode: "insensitive" } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { artist: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy,
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      coverUrl: true,
      audioUrl: true,
      licensePrice: true,
      revenueSharePct: true,
      totalLicenses: true,
      soldLicenses: true,
      aiScore: true,
      district: true,
      createdAt: true,
    },
    take: limit,
  });

  const result = songs.map((s) => ({
    ...s,
    availableLicenses: s.totalLicenses - s.soldLicenses,
    licensePrice: Number(s.licensePrice),
    revenueSharePct: Number(s.revenueSharePct),
  }));

  if (isUnfiltered) {
    await cacheSet(CACHE_KEYS.trendingSongs, result, CACHE_TTL.trendingSongs);
  }

  return NextResponse.json(result);
}
