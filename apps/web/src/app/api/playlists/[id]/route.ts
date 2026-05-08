import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { publicSong } from "@/lib/serializeSong";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  coverUrl: z.string().url().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /api/playlists/:id
 * Fetch a playlist with its full track list. Owners can read any of
 * their playlists; everyone else needs `isPublic=true`.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = session?.user?.id === playlist.ownerId;
  if (!playlist.isPublic && !isOwner) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tracks = await prisma.playlistTrack.findMany({
    where: { playlistId: id },
    orderBy: [{ position: "asc" }, { addedAt: "asc" }],
  });

  let songs: Awaited<ReturnType<typeof prisma.song.findMany>> = [];
  if (tracks.length) {
    songs = await prisma.song.findMany({
      where: { id: { in: tracks.map((t) => t.songId) }, isActive: true },
    });
  }
  const bySongId = new Map(songs.map((s) => [s.id, s]));

  const owner = await prisma.user.findUnique({
    where: { id: playlist.ownerId },
    select: { id: true, name: true, username: true, image: true },
  });

  return NextResponse.json({
    playlist: {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      coverUrl: playlist.coverUrl,
      isPublic: playlist.isPublic,
      shareToken: playlist.shareToken,
      isOwner,
      owner,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
      tracks: tracks
        .map((t) => {
          const song = bySongId.get(t.songId);
          if (!song) return null;
          return {
            id: t.id,
            position: t.position,
            addedAt: t.addedAt,
            song: publicSong({
              ...song,
              licensePrice: Number(song.licensePrice),
              revenueSharePct: Number(song.revenueSharePct),
            }),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    },
  });
}

/**
 * PATCH /api/playlists/:id
 * Owner-only metadata update.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`playlists-patch:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const updated = await prisma.playlist.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
      ...(parsed.data.description !== undefined && {
        description: parsed.data.description?.trim() || null,
      }),
      ...(parsed.data.coverUrl !== undefined && {
        coverUrl: parsed.data.coverUrl || null,
      }),
      ...(parsed.data.isPublic !== undefined && {
        isPublic: parsed.data.isPublic,
      }),
    },
  });

  return NextResponse.json({
    playlist: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      coverUrl: updated.coverUrl,
      isPublic: updated.isPublic,
      shareToken: updated.shareToken,
      updatedAt: updated.updatedAt,
      createdAt: updated.createdAt,
    },
  });
}

/**
 * DELETE /api/playlists/:id
 * Owner-only. Removes the playlist and all its track join rows.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.playlistTrack.deleteMany({ where: { playlistId: id } }),
    prisma.playlist.delete({ where: { id } }),
  ]);

  return NextResponse.json({ ok: true });
}
