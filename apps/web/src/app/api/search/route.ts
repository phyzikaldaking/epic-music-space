import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/search?q=string&limit=10
 *
 * Searches songs (title, artist, genre) and artist studios (username, bio,
 * user.name) using case-insensitive contains. Public, rate-limited per IP.
 *
 * Returns: { songs: [...], artists: [...] }
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await lenientLimiter.consume(`search:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));

  if (!q) {
    return NextResponse.json({ songs: [], artists: [] });
  }

  const [songs, artists] = await Promise.all([
    prisma.song.findMany({
      where: {
        isActive: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { artist: { contains: q, mode: "insensitive" } },
          { genre: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        coverUrl: true,
        audioUrl: true,
        licensePrice: true,
        revenueSharePct: true,
        soldLicenses: true,
        totalLicenses: true,
        bpm: true,
        key: true,
        aiScore: true,
        boostScore: true,
      },
    }),
    prisma.studio.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
          { user: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      orderBy: { level: "desc" },
      take: limit,
      select: {
        username: true,
        level: true,
        bio: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
            connectChargesEnabled: true,
            connectPayoutsEnabled: true,
            _count: { select: { followers: true, songs: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    songs: songs.map((s) => ({
      ...s,
      licensePrice: Number(s.licensePrice),
      revenueSharePct: Number(s.revenueSharePct),
    })),
    artists,
  });
}
