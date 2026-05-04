import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeRoomParticipant } from "@/lib/livekitAdmin";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { userId?: string; reason?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (body.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can ban" }, { status: 403 });
  }

  await prisma.roomBan.upsert({
    where: { roomId_userId: { roomId: id, userId: body.userId } },
    update: { reason: body.reason ?? null, bannedById: session.user.id },
    create: {
      roomId: id,
      userId: body.userId,
      bannedById: session.user.id,
      reason: body.reason ?? null,
    },
  });

  await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: body.userId },
    data: { leftAt: new Date(), role: "LISTENER", handRaised: false },
  });

  await removeRoomParticipant(id, body.userId);

  return NextResponse.json({ ok: true });
}
