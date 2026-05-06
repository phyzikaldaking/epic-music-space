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
  const blocked = await rateLimit("moderate", `room:kick:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (typeof body.userId !== "string" || body.userId.length > 64) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (body.userId === session.user.id) {
    return NextResponse.json({ error: "Cannot kick yourself" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can kick" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }
  if (body.userId === room.hostId) {
    return NextResponse.json({ error: "Cannot kick the host" }, { status: 400 });
  }

  // Mark left + drop them from LiveKit room.
  const updated = await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: body.userId, leftAt: null },
    data: { leftAt: new Date(), role: "LISTENER", handRaised: false },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Listener is no longer in this room" }, { status: 409 });
  }

  // If LiveKit refused the removal, the user's audio is still flowing.
  // Surface that — moderation theater is worse than a 502 the host can
  // retry. The DB row stays "left" since we already updated it.
  const lkResult = await removeRoomParticipant(id, body.userId);
  if (!lkResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Marked left in the database but LiveKit refused the disconnect. They may still be audible briefly — try kick again.",
        livekitReason: lkResult.reason,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
