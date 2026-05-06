import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, noteId } = await params;
  const body = (await req.json().catch(() => ({}))) as { resolved?: boolean };

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) return NextResponse.json({ error: "Host only" }, { status: 403 });
  if (room.status !== "LIVE") return NextResponse.json({ error: "Room has ended" }, { status: 410 });

  const existing = await prisma.roomTimelineNote.findFirst({
    where: { id: noteId, roomId: id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  const note = await prisma.roomTimelineNote.update({
    where: { id: existing.id },
    data: body.resolved
      ? { resolvedAt: new Date(), resolvedById: session.user.id }
      : { resolvedAt: null, resolvedById: null },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return NextResponse.json({ note });
}
