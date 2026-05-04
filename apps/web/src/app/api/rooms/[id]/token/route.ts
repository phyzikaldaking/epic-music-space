import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mintRoomToken, isLiveKitConfigured, getLiveKitConfig } from "@/lib/livekit";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "Live audio is not configured." },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      id: true,
      hostId: true,
      status: true,
      maxCapacity: true,
      _count: { select: { participants: { where: { leftAt: null } } } },
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") {
    return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  }

  const isHost = room.hostId === session.user.id;

  // Check capacity for non-host joins
  if (!isHost && room._count.participants >= room.maxCapacity) {
    return NextResponse.json({ error: "Room is at capacity" }, { status: 403 });
  }

  // Upsert participant. Existing speakers keep their grant.
  const existing = await prisma.roomParticipant.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.user.id } },
    select: { role: true, leftAt: true },
  });

  if (!existing) {
    await prisma.roomParticipant.create({
      data: {
        roomId: id,
        userId: session.user.id,
        role: isHost ? "HOST" : "LISTENER",
      },
    });
  } else if (existing.leftAt) {
    await prisma.roomParticipant.update({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      data: { leftAt: null },
    });
  }

  const role = existing?.role ?? (isHost ? "HOST" : "LISTENER");
  const canPublish = role === "HOST" || role === "SPEAKER";

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  const token = await mintRoomToken({
    roomId: id,
    identity: session.user.id,
    name: user?.name ?? user?.email ?? "Listener",
    canPublish,
    metadata: { role },
  });

  const config = getLiveKitConfig()!;

  return NextResponse.json({
    token,
    url: config.url,
    role,
    isHost,
  });
}
