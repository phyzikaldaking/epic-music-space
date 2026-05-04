import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomLimitsForTier } from "@/lib/roomTier";
import { isLiveKitConfigured } from "@/lib/livekit";

export const runtime = "nodejs";

export async function GET() {
  const rooms = await prisma.room.findMany({
    where: { status: "LIVE" },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      host: { select: { id: true, name: true, image: true, username: true } },
      currentSong: { select: { id: true, title: true, artist: true, coverUrl: true } },
      _count: { select: { participants: true } },
    },
  });
  return NextResponse.json({ rooms });
}

export async function POST(req: Request) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "Live audio is not configured on this deployment yet." },
      { status: 503 },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    songId?: string;
  };

  const title = body.title?.trim();
  if (!title || title.length < 3 || title.length > 120) {
    return NextResponse.json({ error: "Title must be 3–120 chars" }, { status: 400 });
  }

  const host = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, subscriptionTier: true },
  });
  if (!host) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const limits = getRoomLimitsForTier(host.subscriptionTier);

  const existing = await prisma.room.findFirst({
    where: { hostId: host.id, status: "LIVE" },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a live room.", roomId: existing.id },
      { status: 409 },
    );
  }

  const room = await prisma.room.create({
    data: {
      hostId: host.id,
      title,
      description: body.description?.trim() || null,
      currentSongId: body.songId ?? null,
      maxCapacity: limits.maxCapacity,
      participants: {
        create: {
          userId: host.id,
          role: "HOST",
        },
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: room.id }, { status: 201 });
}
