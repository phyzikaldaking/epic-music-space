import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      host: { select: { id: true, name: true, image: true, username: true } },
      currentSong: {
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          audioUrl: true,
          licensePrice: true,
        },
      },
      participants: {
        where: { leftAt: null },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      },
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isHost = room.hostId === session.user.id;
  if (!isHost) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) {
      return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
    }
  }

  // Only the host needs the raw audioUrl — that's how they capture the
  // track and republish it via LiveKit. Listeners never need it; serving
  // it to them is a piracy hole that lets anyone in the room pull the
  // raw paid file out of network responses.
  if (room.currentSong && !isHost) {
    const safeSong = {
      id: room.currentSong.id,
      title: room.currentSong.title,
      artist: room.currentSong.artist,
      coverUrl: room.currentSong.coverUrl,
      licensePrice: room.currentSong.licensePrice,
      audioUrl: "", // intentionally empty for listeners
    };
    return NextResponse.json({ room: { ...room, currentSong: safeSong } });
  }
  return NextResponse.json({ room });
}
