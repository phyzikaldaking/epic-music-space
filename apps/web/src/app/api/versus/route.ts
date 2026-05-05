import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { getActiveLimits } from "@/lib/tierLimits";
import { strictLimiter } from "@/lib/rateLimit";

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

  // Battles light up live realtime + leaderboard channels and create a
  // queue of write fan-out — strict per-user limit so a hostile session
  // can't churn fresh matches faster than fans can vote.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`versus-create:user:${session.user.id}`);
    await strictLimiter.consume(`versus-create:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on battle creation — try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const creator = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true, trialExpiresAt: true },
  });
  if (!creator || !getActiveLimits(creator).canCreateVersus) {
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

  // Validate both songs exist and that the creator owns BOTH of them.
  // (Cross-artist battles require an invite/consent flow we haven't built —
  // until then, only own-catalog matchups are allowed so artists never get
  // dragged into a battle without permission.)
  const [songA, songB] = await Promise.all([
    prisma.song.findUnique({ where: { id: songAId } }),
    prisma.song.findUnique({ where: { id: songBId } }),
  ]);
  if (!songA || !songB) {
    return NextResponse.json({ error: "One or both songs not found." }, { status: 404 });
  }
  if (!songA.isActive || !songB.isActive) {
    return NextResponse.json({ error: "Inactive songs can't battle." }, { status: 400 });
  }
  if (songA.artistId !== session.user.id || songB.artistId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only stage battles between songs you own. Cross-artist battles need consent (coming soon)." },
      { status: 403 },
    );
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
