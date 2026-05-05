import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeRoomParticipant } from "@/lib/livekitAdmin";
import { rateLimit } from "@/lib/rateLimitInline";

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
  const blocked = await rateLimit("moderate", `room:ban:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { userId?: string; reason?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (typeof body.userId !== "string" || body.userId.length > 64) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (body.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can ban" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }
  if (body.userId === room.hostId) {
    return NextResponse.json({ error: "Cannot ban the host" }, { status: 400 });
  }

  await prisma.roomBan.upsert({
    where: { roomId_userId: { roomId: id, userId: body.userId } },
    update: { reason: body.reason?.slice(0, 240) ?? null, bannedById: session.user.id },
    create: {
      roomId: id,
      userId: body.userId,
      bannedById: session.user.id,
      reason: body.reason?.slice(0, 240) ?? null,
    },
  });

  await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: body.userId },
    data: { leftAt: new Date(), role: "LISTENER", handRaised: false },
  });

  await removeRoomParticipant(id, body.userId);

  return NextResponse.json({ ok: true });
}
