import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stopRoomRecording } from "@/lib/livekitAdmin";

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

  await stopRoomRecording(active.egressId);

  // We don't mark it READY here — the LiveKit webhook does that with the
  // final filesize/duration when egress is fully written.
  return NextResponse.json({ ok: true });
}
