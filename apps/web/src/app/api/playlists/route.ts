import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  coverUrl: z.string().url().max(500).optional(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /api/playlists
 * List the caller's playlists, most-recently-updated first.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`playlists-list:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const playlists = await prisma.playlist.findMany({
    where: { ownerId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const ids = playlists.map((p) => p.id);
  const counts = ids.length
    ? await prisma.playlistTrack.groupBy({
        by: ["playlistId"],
        where: { playlistId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const countByPlaylist = new Map(
    counts.map((c) => [c.playlistId, c._count._all]),
  );

  return NextResponse.json({
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      coverUrl: p.coverUrl,
      isPublic: p.isPublic,
      shareToken: p.shareToken,
      trackCount: countByPlaylist.get(p.id) ?? 0,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
    })),
  });
}

/**
 * POST /api/playlists
 * Create a new playlist owned by the caller.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`playlists-create:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const playlist = await prisma.playlist.create({
    data: {
      ownerId: session.user.id,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      coverUrl: parsed.data.coverUrl || null,
      isPublic: parsed.data.isPublic ?? false,
    },
  });

  return NextResponse.json({
    playlist: {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl,
      isPublic: playlist.isPublic,
      shareToken: playlist.shareToken,
      trackCount: 0,
      updatedAt: playlist.updatedAt,
      createdAt: playlist.createdAt,
    },
  });
}
