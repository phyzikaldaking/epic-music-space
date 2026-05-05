import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const blocked = await rateLimit("moderate", `room:raise:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { raised?: boolean };
  const raised = body.raised !== false;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }
  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) {
      return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
    }
  }

  const updated = await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: session.user.id, leftAt: null },
    data: { handRaised: raised },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Join the room before raising your hand" }, { status: 409 });
  }

  return NextResponse.json({ handRaised: raised });
}
