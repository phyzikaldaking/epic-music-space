import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { moderateLimiter } from "@/lib/rateLimit";

/**
 * Derive a synthetic frequency spectrum (20 bins, 0-100) from genre + bpm
 * heuristics. This powers the frequency visualizer in ProductionPostCard
 * without requiring real-time audio analysis infrastructure.
 */
function deriveSpectrum(genre: string | null, bpm: number | null): number[] {
  const g = (genre ?? "").toLowerCase();
  const b = bpm ?? 100;

  // Base curve: natural smiley EQ shape
  const base = [80, 70, 60, 55, 50, 48, 45, 42, 40, 38, 36, 35, 33, 32, 30, 28, 26, 24, 22, 20];

  // Genre overlays — shift energy toward characteristic zones
  if (g.includes("trap") || g.includes("drill")) {
    // Heavy sub, scooped mids
    const overlay = [30, 25, 20, 15, 10, 5, 0, -2, -5, 0, 0, 5, 5, 3, 2, 2, 2, 1, 0, 0];
    return base.map((v, i) => Math.max(5, Math.min(100, v + (overlay[i] ?? 0) + (b > 140 ? 5 : 0))));
  }
  if (g.includes("lo-fi") || g.includes("lofi") || g.includes("chill")) {
    // Warm mids, rolled-off highs
    const overlay = [10, 5, 5, 5, 5, 5, 3, 3, 2, 0, -2, -4, -6, -8, -10, -12, -15, -18, -22, -25];
    return base.map((v, i) => Math.max(5, Math.min(100, v + (overlay[i] ?? 0))));
  }
  if (g.includes("pop") || g.includes("edm") || g.includes("dance")) {
    // Hyped sub + air
    const overlay = [15, 10, 5, 0, -3, -5, -3, 0, 2, 3, 5, 5, 7, 8, 10, 12, 14, 16, 14, 12];
    return base.map((v, i) => Math.max(5, Math.min(100, v + (overlay[i] ?? 0))));
  }
  if (g.includes("jazz") || g.includes("soul") || g.includes("r&b")) {
    // Full mids, gentle sub
    const overlay = [-5, 0, 5, 8, 10, 10, 8, 6, 4, 3, 2, 0, -2, -3, -4, -5, -6, -8, -10, -12];
    return base.map((v, i) => Math.max(5, Math.min(100, v + (overlay[i] ?? 0))));
  }
  if (g.includes("rock") || g.includes("metal") || g.includes("punk")) {
    // Aggressive mids, punchy low-mids
    const overlay = [5, 5, 8, 10, 12, 14, 12, 10, 8, 6, 4, 2, 0, -2, -2, 0, 2, 4, 3, 2];
    return base.map((v, i) => Math.max(5, Math.min(100, v + (overlay[i] ?? 0))));
  }

  // Default: return base with slight BPM energy boost
  const bpmBoost = Math.round((b - 100) / 40);
  return base.map((v) => Math.max(5, Math.min(100, v + bpmBoost)));
}

/**
 * Derive mix health confidence from available song signals.
 * Returns 0-1 value used to color-code the mix health scorecard.
 */
function deriveMixConfidence(song: {
  bpm: number | null;
  key: string | null;
  hasStems: boolean;
  aiScore: number;
  versusWins: number;
  versusLosses: number;
  streamCount: number;
}): number {
  let score = 0.35; // base

  // Having BPM + key set = well-tagged / analyzed track
  if (song.bpm) score += 0.1;
  if (song.key) score += 0.1;
  if (song.hasStems) score += 0.1;

  // AI score (0-100 from existing scoring) normalized
  score += Math.min(0.2, (song.aiScore / 100) * 0.2);

  // Battle performance
  const totalBattles = song.versusWins + song.versusLosses;
  if (totalBattles > 0) {
    const winRate = song.versusWins / totalBattles;
    score += winRate * 0.1;
  }

  // Stream traction (log-scaled, caps at 0.05)
  if (song.streamCount > 0) {
    score += Math.min(0.05, Math.log10(song.streamCount) / 100);
  }

  return Math.min(1, Math.max(0, score));
}

/** Normalize DB Role → ProductionPost authorRole */
function toAuthorRole(role: string): "artist" | "producer" | "engineer" | "listener" {
  switch (role) {
    case "PRODUCER":
      return "producer";
    case "ENGINEER":
      return "engineer";
    case "ARTIST":
      return "artist";
    default:
      return "listener";
  }
}

/**
 * GET /api/production-timeline
 *
 * Returns recent posts that have a song attached, shaped as ProductionPost[].
 * Optionally filter by ?filter=live (isLiveNow only) or ?filter=recommended
 * (mixConfidence >= 0.7).
 *
 * Auth is optional — anonymous visitors see the public feed.
 */
export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(`prod-timeline:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "all";
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  // Auth is optional — block-list filtering applies for authed users
  const session = await auth();
  const viewerId = session?.user?.id;

  let blockedAuthorIds: string[] = [];
  if (viewerId) {
    const [outgoing, incoming] = await Promise.all([
      prisma.userBlock.findMany({ where: { blockerId: viewerId }, select: { blockedId: true } }),
      prisma.userBlock.findMany({ where: { blockedId: viewerId }, select: { blockerId: true } }),
    ]);
    blockedAuthorIds = [
      ...outgoing.map((b) => b.blockedId),
      ...incoming.map((b) => b.blockerId),
    ];
  }

  const posts = await prisma.post.findMany({
    where: {
      isPublished: true,
      songId: { not: null },
      ...(blockedAuthorIds.length ? { authorId: { notIn: blockedAuthorIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          role: true,
        },
      },
    },
  });

  // Fan-out to songs separately (Post has songId but no declared Prisma relation)
  const songIds = Array.from(new Set(posts.map((p) => p.songId).filter((x): x is string => !!x)));
  const songs = songIds.length
    ? await prisma.song.findMany({
        where: { id: { in: songIds } },
        select: {
          id: true,
          title: true,
          artist: true,
          genre: true,
          bpm: true,
          key: true,
          hasStems: true,
          stemFiles: true,
          aiScore: true,
          versusWins: true,
          versusLosses: true,
          streamCount: true,
        },
      })
    : [];
  const songMap = new Map(songs.map((s) => [s.id, s]));

  const hasMore = posts.length > limit;
  const page = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  // Resolve live-session author IDs from Redis heartbeat keys
  const authorIds = Array.from(new Set(page.map((p) => p.author.id)));
  const liveAuthorIds = new Set<string>();
  const redis = getRedis();
  if (redis && authorIds.length) {
    const keys = authorIds.map((id) => `studio:live:${id}`);
    const values = await redis.mget(...keys);
    authorIds.forEach((id, i) => {
      if (values[i] === "1") liveAuthorIds.add(id);
    });
  }

  // Map to ProductionPost shape
  const production = page
    .filter((p) => p.songId !== null)
    .map((p) => {
      const song = songMap.get(p.songId!);
      if (!song) return null;
      const spectrum = deriveSpectrum(song.genre, song.bpm);
      const mixConfidence = deriveMixConfidence({
        bpm: song.bpm,
        key: song.key,
        hasStems: song.hasStems,
        aiScore: song.aiScore,
        versusWins: song.versusWins,
        versusLosses: song.versusLosses,
        streamCount: song.streamCount,
      });

      // Approximate LUFS from mix confidence (well-mixed tracks trend toward -14 LUFS)
      const masterLufs = -23 + mixConfidence * 9;
      // True peak approximates -1 dBFS for well-mastered content
      const masterTruePeak = -6 + mixConfidence * 5;

      // Stem count signals active lane count
      const stemFiles = song.stemFiles as Record<string, unknown> | null;
      const activeLaneCount = stemFiles ? Object.keys(stemFiles).length : (song.hasStems ? 4 : 2);

      // Derive remix / version / stem download proxies from stream + versus data
      const remixCount = Math.floor(song.versusWins * 0.4);
      const versionCount = Math.max(1, Math.floor(song.versusWins * 0.2 + 1));
      const stemDownloadCount = song.hasStems ? Math.floor(song.streamCount * 0.03) : 0;

      return {
        id: p.id,
        authorId: p.author.id,
        authorName: p.author.name ?? p.author.username ?? "Unknown",
        authorImage: p.author.image ?? undefined,
        authorRole: toAuthorRole(p.author.role),
        isLiveNow: liveAuthorIds.has(p.author.id),
        trackId: song.id,
        trackTitle: song.title,
        genre: song.genre ?? "Unknown",
        bpm: song.bpm ?? 120,
        key: song.key ?? undefined,
        spectrum,
        masterLufs,
        masterTruePeak,
        mixConfidence,
        activeLaneCount,
        remixCount,
        versionCount,
        stemDownloadCount,
        createdAt: p.createdAt,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Apply client-side filter after deriving confidence
  const filtered =
    filter === "live"
      ? production.filter((p) => p.isLiveNow)
      : filter === "recommended"
        ? production.filter((p) => p.mixConfidence >= 0.7)
        : production;

  return NextResponse.json({ posts: filtered, nextCursor });
}
