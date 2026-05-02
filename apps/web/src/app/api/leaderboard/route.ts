import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { lenientLimiter } from "@/lib/rateLimit";
import { withQueryBudget } from "@/lib/queryBudget";

const EDGE_CACHE_LEADERBOARD = "public, s-maxage=60, stale-while-revalidate=120";

function leaderboardCacheHeaders() {
  return {
    "Cache-Control": EDGE_CACHE_LEADERBOARD,
    "CDN-Cache-Control": EDGE_CACHE_LEADERBOARD,
    "Vercel-CDN-Cache-Control": EDGE_CACHE_LEADERBOARD,
  };
}

export async function GET(req: NextRequest) {
  // Rate limit reads
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
  const type = searchParams.get("type") ?? "songs";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  if (type === "artists") {
    const cacheKey = CACHE_KEYS.leaderboardArtists;
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, {
        headers: leaderboardCacheHeaders(),
      });
    }

    // Top artists by total licenses sold across all their songs
    const artists = await withQueryBudget(
      "leaderboard.artists.findMany",
      () =>
        prisma.user.findMany({
          where: { role: { in: ["ARTIST", "LABEL"] } },
          select: {
            id: true,
            name: true,
            image: true,
            studio: { select: { username: true, district: true } },
            songs: {
              where: { isActive: true },
              select: { soldLicenses: true, aiScore: true },
              take: 200,
            },
            _count: { select: { followers: true } },
          },
          take: limit * 3,
        }),
      { warnAfterMs: 300, hardAfterMs: 1200, meta: { route: "leaderboard", type } },
    );

    const ranked = artists
      .map((a) => ({
        id: a.id,
        name: a.name,
        image: a.image,
        username: a.studio?.username,
        district: a.studio?.district,
        totalLicensesSold: a.songs.reduce((s, x) => s + x.soldLicenses, 0),
        avgAiScore:
          a.songs.length > 0
            ? a.songs.reduce((s, x) => s + x.aiScore, 0) / a.songs.length
            : 0,
        followers: a._count.followers,
        songCount: a.songs.length,
      }))
      .sort((a, b) => b.totalLicensesSold - a.totalLicensesSold)
      .slice(0, limit);

    await cacheSet(cacheKey, ranked, CACHE_TTL.leaderboard);
    return NextResponse.json(ranked, {
      headers: leaderboardCacheHeaders(),
    });
  }

  // Default: top songs by AI score
  const cacheKey = CACHE_KEYS.leaderboardSongs;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: leaderboardCacheHeaders(),
    });
  }

  const songs = await withQueryBudget(
    "leaderboard.songs.findMany",
    () =>
      prisma.song.findMany({
        where: { isActive: true },
        orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          artist: true,
          genre: true,
          coverUrl: true,
          licensePrice: true,
          revenueSharePct: true,
          soldLicenses: true,
          totalLicenses: true,
          aiScore: true,
          district: true,
          versusWins: true,
        },
      }),
    { warnAfterMs: 250, hardAfterMs: 1000, meta: { route: "leaderboard", type } },
  );

  await cacheSet(cacheKey, songs, CACHE_TTL.leaderboard);
  return NextResponse.json(songs, {
    headers: leaderboardCacheHeaders(),
  });
}

