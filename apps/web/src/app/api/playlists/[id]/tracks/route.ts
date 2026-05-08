import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const addSchema = z.object({
  songId: z.string().min(1).max(50),
});

/**
 * POST /api/playlists/:id/tracks
 * Append a song to the playlist. Idempotent — re-adding an existing
 * track returns 200 without changing position.
 */
export async function POST(
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
    await moderateLimiter.consume(`playlist-add:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id: parsed.data.songId },
    select: { id: true, isActive: true, isDraft: true },
  });
  if (!song || !song.isActive || song.isDraft) {
    return NextResponse.json({ error: "Song not available" }, { status: 404 });
  }

  const existing = await prisma.playlistTrack.findUnique({
    where: {
      playlistId_songId: { playlistId: id, songId: parsed.data.songId },
    },
  });
  if (existing) {
    return NextResponse.json({ added: false, track: existing });
  }

  // New tracks get the next position slot. Float keeps drag-reorder cheap.
  const last = await prisma.playlistTrack.findFirst({
    where: { playlistId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? 0) + 1;

  const track = await prisma.playlistTrack.create({
    data: {
      playlistId: id,
      songId: parsed.data.songId,
      addedById: session.user.id,
      position: nextPosition,
    },
  });

  // Bump the playlist updatedAt so the index page resort reflects activity.
  await prisma.playlist.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ added: true, track });
}
