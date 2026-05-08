import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { lenientLimiter } from "@/lib/rateLimit";
import { publicSongs, type SongLike } from "@/lib/serializeSong";
import { prisma } from "@/lib/prisma";

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

  const cacheKey = CACHE_KEYS.trendingSongs;
  const cached = await cacheGet<SongLike[]>(cacheKey);
  if (cached) return NextResponse.json(publicSongs(cached));

  const songs = await prisma.song.findMany({
    // Drafts and future-scheduled tracks must never leak onto public surfaces.
    where: {
      isActive: true,
      isDraft: false,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  // Cache the raw shape so we keep audioUrl available server-side; redact
  // for the response.
  await cacheSet(cacheKey, songs, CACHE_TTL.trendingSongs);
  return NextResponse.json(publicSongs(songs));
}

/**
 * POST /api/songs is deprecated. The canonical create endpoint is
 * `/api/songs/create` (richer schema: stems, legacy, free downloads).
 * Redirect with 308 so any straggler clients get auto-forwarded with
 * their request body intact.
 */
export function POST() {
  return NextResponse.redirect(new URL("/api/songs/create", "https://epicmusicspace.com"), 308);
}

