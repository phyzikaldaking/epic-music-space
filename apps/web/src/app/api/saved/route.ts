import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { publicSong } from "@/lib/serializeSong";

export const runtime = "nodejs";

const toggleSchema = z.object({
  songId: z.string().min(1).max(50),
});

/**
 * GET /api/saved
 *
 * Returns the caller's saved (wishlisted) tracks, most-recent first.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`saved-list:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));

  const rows = await prisma.savedTrack.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  if (rows.length === 0) return NextResponse.json({ saved: [] });

  const songs = await prisma.song.findMany({
    where: { id: { in: rows.map((r) => r.songId) }, isActive: true },
  });
  const bySongId = new Map(songs.map((s) => [s.id, s]));

  const saved = rows
    .map((r) => {
      const song = bySongId.get(r.songId);
      if (!song) return null;
      return {
        savedAt: r.createdAt,
        song: publicSong({
          ...song,
          licensePrice: Number(song.licensePrice),
          revenueSharePct: Number(song.revenueSharePct),
        }),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ saved });
}

/**
 * POST /api/saved
 *
 * Toggle: adds the song to saved if not present, removes it if present.
 * Body: { songId }. Returns { saved: boolean }.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`saved-toggle:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await prisma.savedTrack.findUnique({
    where: { userId_songId: { userId: session.user.id, songId: parsed.data.songId } },
  });

  if (existing) {
    await prisma.savedTrack.delete({ where: { id: existing.id } });
    return NextResponse.json({ saved: false });
  }

  await prisma.savedTrack.create({
    data: { userId: session.user.id, songId: parsed.data.songId },
  });
  return NextResponse.json({ saved: true });
}
