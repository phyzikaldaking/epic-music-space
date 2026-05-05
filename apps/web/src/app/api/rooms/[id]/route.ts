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
      currentSong: { select: { id: true, title: true, artist: true, coverUrl: true, audioUrl: true } },
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
  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) {
      return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
    }
  }
  return NextResponse.json({ room });
}
