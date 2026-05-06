import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SESSION_MODES = new Set(["PLAYBACK", "CRITIQUE", "A_AND_R", "SILENT_NOTES"]);
const STUDIO_VIBES = new Set(["NEON", "SUNSET", "MIDNIGHT"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      id: true,
      hostId: true,
      status: true,
      sessionMode: true,
      studioVibe: true,
      spotlightUserId: true,
      crowdEnergy: true,
      applauseBursts: true,
      heatPoints: true,
      autoQueueEnabled: true,
      quietMode: true,
      speakerLimitSec: true,
    },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (room.hostId !== session.user.id) {
    const banned = await prisma.roomBan.findUnique({
      where: { roomId_userId: { roomId: id, userId: session.user.id } },
      select: { id: true },
    });
    if (banned) return NextResponse.json({ error: "You are banned from this room" }, { status: 403 });
  }

  return NextResponse.json({ state: room });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { id: true, hostId: true, status: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.status !== "LIVE") return NextResponse.json({ error: "Room has ended" }, { status: 410 });
  if (room.hostId !== session.user.id) return NextResponse.json({ error: "Host only" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    sessionMode?: string;
    studioVibe?: string;
    spotlightUserId?: string | null;
    crowdEnergy?: number;
    applauseBursts?: number;
    heatPoints?: unknown;
    autoQueueEnabled?: boolean;
    quietMode?: boolean;
    speakerLimitSec?: number;
  };

  const update: Record<string, unknown> = {};
  if (body.sessionMode && SESSION_MODES.has(body.sessionMode)) update.sessionMode = body.sessionMode;
  if (body.studioVibe && STUDIO_VIBES.has(body.studioVibe)) update.studioVibe = body.studioVibe;
  if (body.spotlightUserId === null || typeof body.spotlightUserId === "string") {
    update.spotlightUserId = body.spotlightUserId;
  }
  if (typeof body.crowdEnergy === "number" && Number.isFinite(body.crowdEnergy)) {
    update.crowdEnergy = Math.max(0, Math.min(100, Math.round(body.crowdEnergy)));
  }
  if (typeof body.applauseBursts === "number" && Number.isFinite(body.applauseBursts)) {
    update.applauseBursts = Math.max(0, Math.min(5000, Math.round(body.applauseBursts)));
  }
  if (Array.isArray(body.heatPoints)) {
    update.heatPoints = body.heatPoints
      .filter((n) => typeof n === "number" && Number.isFinite(n))
      .map((n) => Math.max(0, Math.min(100, Math.round(n))))
      .slice(-32);
  }
  if (typeof body.autoQueueEnabled === "boolean") update.autoQueueEnabled = body.autoQueueEnabled;
  if (typeof body.quietMode === "boolean") update.quietMode = body.quietMode;
  if (typeof body.speakerLimitSec === "number" && Number.isFinite(body.speakerLimitSec)) {
    update.speakerLimitSec = Math.max(15, Math.min(300, Math.round(body.speakerLimitSec)));
  }

  const next = await prisma.room.update({
    where: { id },
    data: update,
    select: {
      sessionMode: true,
      studioVibe: true,
      spotlightUserId: true,
      crowdEnergy: true,
      applauseBursts: true,
      heatPoints: true,
      autoQueueEnabled: true,
      quietMode: true,
      speakerLimitSec: true,
    },
  });
  return NextResponse.json({ state: next });
}
