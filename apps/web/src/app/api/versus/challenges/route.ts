import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";
import { getActiveLimits } from "@/lib/tierLimits";

export const runtime = "nodejs";

const createSchema = z.object({
  challengerSongId: z.string().cuid(),
  opponentUsername: z.string().min(1).max(64),
  message: z.string().max(500).optional(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

const PENDING_TTL_MS = 48 * 60 * 60 * 1000; // 48h to accept

/**
 * POST /api/versus/challenges
 *
 * Send a challenge from the caller's track to another artist. The opponent
 * sees the pending challenge in their notifications and on /versus/inbox,
 * and can accept (which creates the actual VersusMatch) or decline.
 *
 * No tier-gating on receiving — anyone can be challenged. Pro plan still
 * required to *send* a challenge (existing canCreateVersus flag).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`versus-challenge:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down — you're sending challenges too quickly." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const challenger = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, subscriptionTier: true, trialExpiresAt: true },
  });
  if (!challenger || !getActiveLimits(challenger).canCreateVersus) {
    return NextResponse.json(
      { error: "Sending challenges requires a Pro plan. Upgrade at /pricing." },
      { status: 403 },
    );
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { challengerSongId, opponentUsername, message, durationHours } = parsed.data;

  // Validate the challenger's song is theirs and active.
  const song = await prisma.song.findUnique({
    where: { id: challengerSongId },
    select: { id: true, title: true, artistId: true, isActive: true },
  });
  if (!song || song.artistId !== session.user.id || !song.isActive) {
    return NextResponse.json(
      { error: "That song doesn't belong to you or isn't active." },
      { status: 400 },
    );
  }

  // Resolve opponent by their studio username.
  const opponentStudio = await prisma.studio.findUnique({
    where: { username: opponentUsername.toLowerCase() },
    select: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!opponentStudio) {
    return NextResponse.json({ error: "Opponent not found." }, { status: 404 });
  }
  if (opponentStudio.user.id === session.user.id) {
    return NextResponse.json({ error: "Can't challenge yourself." }, { status: 400 });
  }
  if (opponentStudio.user.role === "LISTENER") {
    return NextResponse.json(
      { error: "Opponent isn't an artist — they can't be challenged." },
      { status: 400 },
    );
  }

  // Anti-spam: at most one PENDING challenge per (challenger → opponent) pair.
  const existingPending = await prisma.versusChallenge.findFirst({
    where: {
      challengerId: session.user.id,
      opponentId: opponentStudio.user.id,
      status: "PENDING",
    },
  });
  if (existingPending) {
    return NextResponse.json(
      { error: "You already have a pending challenge to that artist." },
      { status: 409 },
    );
  }

  const challenge = await prisma.versusChallenge.create({
    data: {
      challengerId: session.user.id,
      challengerSongId,
      opponentId: opponentStudio.user.id,
      message,
      durationHours,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });

  // Notify the opponent.
  void enqueueNotification({
    userId: opponentStudio.user.id,
    type: "VERSUS_CHALLENGE",
    title: `${challenger.name ?? "An artist"} challenged you to a versus`,
    body: message
      ? `"${message.slice(0, 140)}" — pick a track to accept or decline within 48h.`
      : `Pick a track of yours to accept (or decline) within 48h.`,
    metadata: { challengeId: challenge.id, challengerSongId, challengerSongTitle: song.title },
  });

  return NextResponse.json({ challenge }, { status: 201 });
}

/**
 * GET /api/versus/challenges?role=incoming|outgoing
 *
 * Lists the caller's challenges. Used by /versus/inbox.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = new URL(req.url).searchParams.get("role") ?? "incoming";
  const where = role === "outgoing"
    ? { challengerId: session.user.id }
    : { opponentId: session.user.id };

  const challenges = await prisma.versusChallenge.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (challenges.length === 0) return NextResponse.json({ challenges: [] });

  // Stitch in songs + opponent display info.
  const songIds = Array.from(
    new Set(
      challenges.flatMap((c) => [c.challengerSongId, c.opponentSongId].filter((x): x is string => !!x)),
    ),
  );
  const userIds = Array.from(new Set(challenges.flatMap((c) => [c.challengerId, c.opponentId])));

  const [songs, users] = await Promise.all([
    prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, artist: true, coverUrl: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true, studio: { select: { username: true } } },
    }),
  ]);
  const songById = new Map(songs.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    challenges: challenges.map((c) => ({
      ...c,
      challenger: userById.get(c.challengerId),
      opponent: userById.get(c.opponentId),
      challengerSong: songById.get(c.challengerSongId),
      opponentSong: c.opponentSongId ? songById.get(c.opponentSongId) : null,
    })),
  });
}
