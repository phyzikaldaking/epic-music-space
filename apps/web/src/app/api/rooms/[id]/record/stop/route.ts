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
  const blocked = await rateLimit("moderate", `room:record_stop:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can stop recording" }, { status: 403 });
  }

  const active = await prisma.roomRecording.findFirst({
    where: { roomId: id, status: { in: ["PENDING", "RECORDING"] } },
  });
  if (!active || !active.egressId) {
    return NextResponse.json({ ok: true });
  }

  const lkResult = await stopRoomRecording(active.egressId);
  if (!lkResult.ok) {
    // Mark the recording row FAILED so the host's UI doesn't sit in
    // "stopping" forever and the egress doesn't leak as a stuck
    // RECORDING row that the webhook never finalizes.
    await prisma.roomRecording.update({
      where: { id: active.id },
      data: { status: "FAILED" },
    }).catch(() => null);
    return NextResponse.json(
      {
        ok: false,
        error:
          "LiveKit didn't acknowledge the stop. The recording was marked failed — restart it if you want to try again.",
        livekitReason: lkResult.reason,
      },
      { status: 502 },
    );
  }

  // We don't mark it READY here — the LiveKit webhook does that with the
  // final filesize/duration when egress is fully written.
  return NextResponse.json({ ok: true });
}
