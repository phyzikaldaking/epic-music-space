import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getTierLimits } from "@/lib/tierLimits";

const createSchema = z.object({
  songAId: z.string().cuid(),
  songBId: z.string().cuid(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

export async function GET() {
  const matches = await prisma.versusMatch.findMany({
    where: { status: "ACTIVE" },
    include: {
      songA: { select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true } },
      songB: { select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(matches);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true },
  });
  if (!creator || !getTierLimits(creator.subscriptionTier).canCreateVersus) {
    return NextResponse.json(
      { error: "Versus battle creation requires a Pro plan or higher. Upgrade at /pricing." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { songAId, songBId, durationHours } = parsed.data;

  if (songAId === songBId) {
    return NextResponse.json({ error: "A song cannot battle itself." }, { status: 400 });
  }

  // Validate both songs exist
  const [songA, songB] = await Promise.all([
    prisma.song.findUnique({ where: { id: songAId } }),
    prisma.song.findUnique({ where: { id: songBId } }),
  ]);
  if (!songA || !songB) {
    return NextResponse.json({ error: "One or both songs not found." }, { status: 404 });
  }

  const endsAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  const match = await prisma.versusMatch.create({
    data: { songAId, songBId, endsAt },
    include: {
      songA: { select: { title: true } },
      songB: { select: { title: true } },
    },
  });

  return NextResponse.json(match, { status: 201 });
}
