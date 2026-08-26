import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { songId?: string; notes?: string } | null;
  if (!body?.songId) return NextResponse.json({ error: "songId is required" }, { status: 400 });
  const song = await prisma.rightsSong.findFirst({ where: { id: body.songId, ownerId: session.user.id }, select: { id: true } });
  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  const item = await prisma.rightsReview.create({ data: { requesterId: session.user.id, songId: song.id, notes: body.notes?.slice(0, 2000) } });
  return NextResponse.json({ review: item }, { status: 201 });
}
