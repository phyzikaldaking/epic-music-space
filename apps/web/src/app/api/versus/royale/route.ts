import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getTierLimits } from "@/lib/tierLimits";

const SONG_SELECT = {
  id: true,
  title: true,
  artist: true,
  coverUrl: true,
  audioUrl: true,
  aiScore: true,
} as const;

const createSchema = z.object({
  songIds: z.array(z.string().cuid()).min(2).max(10),
  durationHours: z.number().int().min(1).max(168).default(24),
});

export async function GET() {
  const battles = await prisma.battleRoyale.findMany({
    where: { status: "ACTIVE" },
    include: {
      entries: {
        include: { song: { select: SONG_SELECT } },
        orderBy: { position: "asc" },
      },
      _count: { select: { votes: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(battles);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, role: true },
  });
  const canCreate =
    creator?.role === "ADMIN" ||
    (creator && getTierLimits(creator.subscriptionTier).canCreateVersus);
  if (!canCreate) {
    return NextResponse.json(
      { error: "Battle creation requires a Pro plan or higher. Upgrade at /pricing." },
      { status: 403 },
    );
  }

  const body = await req.json() as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { songIds, durationHours } = parsed.data;

  if (new Set(songIds).size !== songIds.length) {
    return NextResponse.json({ error: "Duplicate songs in battle." }, { status: 400 });
  }

  const songs = await prisma.song.findMany({
    where: { id: { in: songIds } },
    select: { id: true },
  });
  if (songs.length !== songIds.length) {
    return NextResponse.json({ error: "One or more songs not found." }, { status: 404 });
  }

  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const battle = await prisma.battleRoyale.create({
    data: {
      creatorId: session.user.id,
      endsAt,
      entries: {
        create: songIds.map((songId, i) => ({ songId, position: i })),
      },
    },
    include: {
      entries: {
        include: { song: { select: SONG_SELECT } },
        orderBy: { position: "asc" },
      },
    },
  });

  return NextResponse.json(battle, { status: 201 });
}
