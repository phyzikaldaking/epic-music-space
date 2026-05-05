import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomLimitsForTier } from "@/lib/roomTier";
import { isRecordingConfigured, startRoomRecording } from "@/lib/livekitAdmin";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isRecordingConfigured()) {
    return NextResponse.json(
      { error: "Replay recordings are not configured on this deployment." },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("moderate", `room:record_start:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only host can start recording" }, { status: 403 });
  }
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }

  const host = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true },
  });
  const limits = getRoomLimitsForTier(host?.subscriptionTier ?? "FREE");
  if (!limits.canRecord) {
    return NextResponse.json(
      { error: `Replay drops are available on Pro and above. You're on ${limits.label}.` },
      { status: 402 },
    );
  }

  // Idempotent — if a recording is already active, return it.
  const existing = await prisma.roomRecording.findFirst({
    where: { roomId: id, status: { in: ["PENDING", "RECORDING"] } },
  });
  if (existing) {
    return NextResponse.json({ id: existing.id, egressId: existing.egressId, status: existing.status });
  }

  try {
    const started = await startRoomRecording(id);
    const recording = await prisma.roomRecording.create({
      data: {
        roomId: id,
        egressId: started.egressId,
        playbackUrl: started.publicUrl,
        status: "RECORDING",
      },
    });
    return NextResponse.json({ id: recording.id, egressId: recording.egressId, status: recording.status });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Failed to start recording";
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
