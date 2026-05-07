import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter } from "@/lib/rateLimit";

/**
 * GET /api/stems/search
 *
 * Powers the Loop Browser inside the DAW. Returns every Song where
 * stem separation is READY, optionally filtered by query text + BPM
 * range, with the per-stem URLs pre-resolved so the client can
 * preview/drag in one round trip.
 *
 * The economic flywheel: every stem returned here is a draggable loop.
 * When a producer drops it onto a DAW track, /api/stems/usage records
 * the StemUsage row that pays the source artist a 2% royalty share
 * when the derived track earns revenue.
 *
 * Query params:
 *   q       — text match against title + artist + genre
 *   bpmMin  — minimum bpm
 *   bpmMax  — maximum bpm
 *   genre   — exact genre match
 *   limit   — page size (default 24, max 100)
 *   cursor  — opaque pagination cursor (Song.id)
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await lenientLimiter.consume(`stems-search:${ip}`);
  } catch {
    return NextResponse.json({ error: "rate-limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const genre = (url.searchParams.get("genre") ?? "").trim();
  const bpmMin = Number(url.searchParams.get("bpmMin")) || 0;
  const bpmMax = Number(url.searchParams.get("bpmMax")) || 0;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 24));
  const cursor = url.searchParams.get("cursor");

  const where: Parameters<typeof prisma.song.findMany>[0] = {
    where: {
      isActive: true,
      stemSeparationStatus: "READY",
      ...(q && {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { artist: { contains: q, mode: "insensitive" } },
          { genre: { contains: q, mode: "insensitive" } },
        ],
      }),
      ...(genre && { genre: { equals: genre, mode: "insensitive" } }),
      ...(bpmMin && { bpm: { gte: bpmMin } }),
      ...(bpmMax && { bpm: { lte: bpmMax, ...(bpmMin && { gte: bpmMin }) } }),
    },
  };
  const songs = await prisma.song.findMany({
    ...where,
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      bpm: true,
      key: true,
      coverUrl: true,
      stemFiles: true,
      artistId: true,
      artist_: { select: { name: true, image: true } },
    },
    orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = songs.length > limit;
  const items = (hasMore ? songs.slice(0, -1) : songs).map((s) => {
    const stems = (s.stemFiles ?? {}) as Record<string, string | undefined>;
    return {
      id: s.id,
      title: s.title,
      artist: s.artist_?.name ?? s.artist,
      artistId: s.artistId,
      genre: s.genre,
      bpm: s.bpm,
      key: s.key,
      coverUrl: s.coverUrl,
      stems: {
        vocals: stems.vocals ?? null,
        drums: stems.drums ?? null,
        bass: stems.bass ?? null,
        other: stems.other ?? null,
      },
    };
  });

  return NextResponse.json(
    { items, nextCursor: hasMore ? items[items.length - 1]?.id : null },
    { headers: { "Cache-Control": "private, max-age=30" } },
  );
}
