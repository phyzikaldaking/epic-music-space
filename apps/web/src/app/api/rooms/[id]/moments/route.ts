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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const blocked = await rateLimit("moderate", `room:moments:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "APPLAUSE") {
    return NextResponse.json({ error: "Unsupported moment action" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: { id: true, hostId: true, status: true, crowdEnergy: true, applauseBursts: true, heatPoints: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") return NextResponse.json({ error: "Room has ended" }, { status: 410 });

  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  }

  const currentHeat = Array.isArray(room.heatPoints)
    ? room.heatPoints.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    : [];
  const energy = Math.max(0, Math.min(100, Math.round(room.crowdEnergy + 8)));
  const nextHeat = [...currentHeat.slice(-31), energy];
  const next = await prisma.room.update({
    where: { id },
    data: {
      crowdEnergy: energy,
      applauseBursts: room.applauseBursts + 1,
      heatPoints: nextHeat,
    },
    select: { crowdEnergy: true, applauseBursts: true, heatPoints: true },
  });

  return NextResponse.json({ state: next });
}

