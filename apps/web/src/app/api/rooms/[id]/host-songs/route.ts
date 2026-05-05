import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

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
  const blocked = await rateLimit("lenient", `room:host_songs:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host" }, { status: 403 });
  }

  const songs = await prisma.song.findMany({
    where: { artistId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, artist: true, coverUrl: true, audioUrl: true },
    take: 50,
  });

  return NextResponse.json({ songs });
}
