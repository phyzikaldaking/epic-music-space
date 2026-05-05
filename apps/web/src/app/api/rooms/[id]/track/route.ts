import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Host changes the currently-featured track. Listeners should be told via
// Supabase broadcast so their license CTA updates instantly.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { songId?: string | null };
  if (body.songId && (typeof body.songId !== "string" || body.songId.length > 64)) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can change the track" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }

  // Verify host owns the song (if a song is being set)
  if (body.songId) {
    const song = await prisma.song.findFirst({
      where: { id: body.songId, isActive: true },
      select: { artistId: true },
    });
    if (!song || song.artistId !== session.user.id) {
      return NextResponse.json({ error: "Track must belong to you" }, { status: 403 });
    }
  }

  await prisma.room.update({
    where: { id },
    data: { currentSongId: body.songId ?? null },
  });

  const song = body.songId
    ? await prisma.song.findUnique({
        where: { id: body.songId },
        select: { id: true, title: true, artist: true, coverUrl: true, audioUrl: true, licensePrice: true, soldLicenses: true, totalLicenses: true },
      })
    : null;

  return NextResponse.json({
    song: song
      ? {
          ...song,
          licensePrice: song.licensePrice.toString(),
        }
      : null,
  });
}
