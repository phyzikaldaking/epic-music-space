import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

// Host grants the floor to a listener (promotes them to SPEAKER).
// They will need to refetch their token to get publish permissions.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("moderate", `room:grant:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (typeof body.userId !== "string" || body.userId.length > 64) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (body.userId === session.user.id) {
    return NextResponse.json({ error: "Host already has the floor" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can grant the floor" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }

  const updated = await prisma.roomParticipant.updateMany({
    where: { roomId: id, userId: body.userId, leftAt: null, role: "LISTENER" },
    data: { role: "SPEAKER", handRaised: false },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Listener is no longer waiting in this room" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
