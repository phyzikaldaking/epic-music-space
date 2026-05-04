import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const message = await prisma.roomMessage.create({
    data: { roomId: id, userId: session.user.id, body: text },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ message });
}
