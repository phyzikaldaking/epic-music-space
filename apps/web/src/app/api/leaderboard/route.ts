import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { lenientLimiter } from "@/lib/rateLimit";

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
    if (cached) return NextResponse.json(cached);

    // Top artists by total licenses sold across all their songs
    const artists = await prisma.user.findMany({
      where: { role: { in: ["ARTIST", "LABEL"] } },
      select: {
        id: true,
        name: true,
        image: true,
        studio: { select: { username: true, district: true } },
        songs: {
          where: { isActive: true },
          select: { soldLicenses: true, aiScore: true },
        },
        _count: { select: { followers: true } },
      },
      take: limit * 3, // over-fetch then sort
    });

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
    return NextResponse.json(ranked);
  }

  // Default: top songs by AI score
  const cacheKey = CACHE_KEYS.leaderboardSongs;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const songs = await prisma.song.findMany({
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
  });

  await cacheSet(cacheKey, songs, CACHE_TTL.leaderboard);
  return NextResponse.json(songs);
}

