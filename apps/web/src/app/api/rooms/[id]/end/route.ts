import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stopRoomRecording } from "@/lib/livekitAdmin";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("moderate", `room:end:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can end the room" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ ok: true });
  }

  // If a recording is running, stop it so the file finalizes. If the stop
  // fails the egress could keep running on LiveKit's side and cost money;
  // mark the recording FAILED so the row doesn't sit RECORDING forever.
  const activeRecording = await prisma.roomRecording.findFirst({
    where: { roomId: id, status: { in: ["PENDING", "RECORDING"] } },
    select: { id: true, egressId: true },
  });
  if (activeRecording?.egressId) {
    const lkStop = await stopRoomRecording(activeRecording.egressId);
    if (!lkStop.ok) {
      await prisma.roomRecording.update({
        where: { id: activeRecording.id },
        data: { status: "FAILED" },
      }).catch(() => null);
    }
  }

  // Also flip every still-attached participant to leftAt=now so the
  // /studio/live lobby capacity / counts don't show stale rows after end.
  await Promise.allSettled([
    prisma.room.update({
      where: { id },
      data: { status: "ENDED", endedAt: new Date() },
    }),
    prisma.roomParticipant.updateMany({
      where: { roomId: id, leftAt: null },
      data: { leftAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
