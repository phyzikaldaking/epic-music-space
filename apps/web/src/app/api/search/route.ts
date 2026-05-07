import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";
import type { Prisma } from "@ems/db";

export const runtime = "nodejs";

/**
 * GET /api/search?q=string&limit=10&genre=Trap&bpmMin=120&bpmMax=160&key=C minor&priceMax=20&sort=newest&cursor=cuid
 *
 * Searches songs and artist studios. Supports optional filters for genre,
 * BPM range, musical key, and max price. Cursor-based pagination.
 *
 * Returns: { songs: [...], artists: [...], nextCursor: string | null }
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
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  // Optional filters
  const genre = url.searchParams.get("genre")?.trim() || undefined;
  const bpmMin = Number(url.searchParams.get("bpmMin")) || undefined;
  const bpmMax = Number(url.searchParams.get("bpmMax")) || undefined;
  const musicalKey = url.searchParams.get("key")?.trim() || undefined;
  const priceMax = Number(url.searchParams.get("priceMax")) || undefined;
  const sort = url.searchParams.get("sort") ?? "relevance"; // relevance | newest | price-low | price-high

  const hasFilters = !!(genre || bpmMin || bpmMax || musicalKey || priceMax);

  if (!q && !hasFilters) {
    return NextResponse.json({ songs: [], artists: [], nextCursor: null });
  }

  // Build song where clause
  const songWhere: Prisma.SongWhereInput = { isActive: true };
  const conditions: Prisma.SongWhereInput[] = [];

  if (q) {
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { artist: { contains: q, mode: "insensitive" } },
        { genre: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (genre) {
    conditions.push({ genre: { equals: genre, mode: "insensitive" } });
  }
  if (bpmMin || bpmMax) {
    const bpmFilter: Prisma.IntNullableFilter = {};
    if (bpmMin) bpmFilter.gte = bpmMin;
    if (bpmMax) bpmFilter.lte = bpmMax;
    conditions.push({ bpm: bpmFilter });
  }
  if (musicalKey) {
    conditions.push({ key: { contains: musicalKey, mode: "insensitive" } });
  }
  if (priceMax) {
    conditions.push({ licensePrice: { lte: priceMax } });
  }

  if (conditions.length > 0) {
    songWhere.AND = conditions;
  }

  // Sort order
  let orderBy: Prisma.SongOrderByWithRelationInput[];
  switch (sort) {
    case "newest":
      orderBy = [{ createdAt: "desc" }];
      break;
    case "price-low":
      orderBy = [{ licensePrice: "asc" }];
      break;
    case "price-high":
      orderBy = [{ licensePrice: "desc" }];
      break;
    default:
      orderBy = [{ aiScore: "desc" }, { soldLicenses: "desc" }];
  }

  const [songs, artists] = await Promise.all([
    prisma.song.findMany({
      where: songWhere,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
        createdAt: true,
      },
    }),
    // Only search artists when there's a text query (filters are track-only)
    q
      ? prisma.studio.findMany({
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
        })
      : [],
  ]);

  const hasMore = songs.length > limit;
  const songPage = hasMore ? songs.slice(0, limit) : songs;
  const nextCursor = hasMore ? songPage[songPage.length - 1]?.id ?? null : null;

  const { publicSong } = await import("@/lib/serializeSong");
  return NextResponse.json({
    songs: songPage.map((s) =>
      publicSong({
        ...s,
        licensePrice: Number(s.licensePrice),
        revenueSharePct: Number(s.revenueSharePct),
      }),
    ),
    artists,
    nextCursor,
  });
}
