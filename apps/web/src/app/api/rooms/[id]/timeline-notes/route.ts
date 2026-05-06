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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { id: true, hostId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  }

  const notes = await prisma.roomTimelineNote.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, image: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });
  return NextResponse.json({ notes: notes.reverse() });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const blocked = await rateLimit("moderate", `room:timeline-note:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    body?: string;
    atSeconds?: number;
    category?: "GENERAL" | "MIX" | "MASTER" | "SONGWRITING" | "ARRANGEMENT" | "PERFORMANCE";
    parentId?: string | null;
  };
  const text = body.body?.trim();
  if (!text || text.length > 280) {
    return NextResponse.json({ error: "Note must be 1–280 chars" }, { status: 400 });
  }
  const atSeconds =
    typeof body.atSeconds === "number" && Number.isFinite(body.atSeconds)
      ? Math.max(0, Math.min(60 * 60 * 6, Math.floor(body.atSeconds)))
      : 0;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { id: true, hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") return NextResponse.json({ error: "Room has ended" }, { status: 410 });

  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  }

  const note = await prisma.roomTimelineNote.create({
    data: {
      roomId: id,
      userId: session.user.id,
      body: text,
      atSeconds,
      category: body.category ?? "GENERAL",
      parentId: body.parentId ?? null,
    },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return NextResponse.json({ note });
}
