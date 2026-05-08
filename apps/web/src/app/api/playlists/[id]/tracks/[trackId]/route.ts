import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * DELETE /api/playlists/:id/tracks/:trackId
 * Owner-only. Removes a track from the playlist.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; trackId: string }> },
) {
  const { id, trackId } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const track = await prisma.playlistTrack.findUnique({ where: { id: trackId } });
  if (!track || track.playlistId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.playlistTrack.delete({ where: { id: trackId } });
  await prisma.playlist.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
