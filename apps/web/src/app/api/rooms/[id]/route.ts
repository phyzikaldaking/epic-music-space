import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      _count: { select: { participants: true } },
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ room });
}
