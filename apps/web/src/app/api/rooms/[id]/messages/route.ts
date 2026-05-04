import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { maskProfanity } from "@/lib/profanity";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const messages = await prisma.roomMessage.findMany({
    where: { roomId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = body.body?.trim();
  if (!text || text.length > 500) {
    return NextResponse.json({ error: "Message must be 1–500 chars" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }

  // Block messages from banned users
  const banned = await prisma.roomBan.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.user.id } },
    select: { id: true },
  });
  if (banned) {
    return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  }

  const { masked } = maskProfanity(text);

  const message = await prisma.roomMessage.create({
    data: { roomId: id, userId: session.user.id, body: masked },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ message });
}
