import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const PENDING_TTL_MS = 48 * 60 * 60 * 1000; // 48h to accept

const createSchema = z.object({
  opponentUsername: z.string().min(1).max(64),
  challengerSongIds: z.array(z.string().cuid()).min(1).max(10),
  theme: z.string().max(80).optional(),
  totalRounds: z.number().int().min(1).max(10).optional(),
  roundDurationSec: z.number().int().min(60).max(600).optional(),
  tier: z.enum(["MAIN_EVENT", "SPEED"]).optional(),
  startsAt: z.string().datetime(),
  message: z.string().max(500).optional(),
});

/**
 * POST /api/verzuz/challenges
 *
 * Send a Verzuz invitation to another artist. The challenger proposes
 * theme / start time / round count and stages their own setlist.
 * The opponent fills in their setlist on accept. Without this flow, the
 * /api/verzuz POST requires the caller to own both setlists — which is
 * impossible cross-artist.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`verzuz-challenge:${session.user.id}:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down — you're sending invitations too quickly." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const {
    opponentUsername,
    challengerSongIds,
    theme,
    totalRounds,
    roundDurationSec,
    tier,
    startsAt,
    message,
  } = parsed.data;

  // Resolve opponent by studio username.
  const opponentStudio = await prisma.studio.findUnique({
    where: { username: opponentUsername.trim() },
    select: { user: { select: { id: true, name: true } } },
  });
  if (!opponentStudio?.user) {
    return NextResponse.json({ error: "Opponent not found." }, { status: 404 });
  }
  const opponentUser = opponentStudio.user;
  if (opponentUser.id === session.user.id) {
    return NextResponse.json(
      { error: "You can't challenge yourself. Pick another artist." },
      { status: 400 },
    );
  }

  // Validate every challenger song belongs to the caller and is active.
  const songs = await prisma.song.findMany({
    where: {
      id: { in: challengerSongIds },
      artistId: session.user.id,
      isActive: true,
    },
    select: { id: true },
  });
  if (songs.length !== challengerSongIds.length) {
    return NextResponse.json(
      { error: "One or more songs aren't yours or aren't active." },
      { status: 400 },
    );
  }

  const startsAtDate = new Date(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
  }
  if (startsAtDate.getTime() < Date.now() - 60_000) {
    return NextResponse.json(
      { error: "Start time must be in the future." },
      { status: 400 },
    );
  }

  const challenge = await prisma.verzuzChallenge.create({
    data: {
      challengerId: session.user.id,
      opponentId: opponentUser.id,
      challengerSongIds,
      opponentSongIds: [],
      proposedTheme: theme,
      proposedTotalRounds: totalRounds ?? challengerSongIds.length,
      proposedRoundDurationSec: roundDurationSec ?? 180,
      proposedTier: tier ?? "MAIN_EVENT",
      proposedStartsAt: startsAtDate,
      message,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  });

  void enqueueNotification({
    userId: opponentUser.id,
    type: "VERZUZ_CHALLENGE_RECEIVED",
    title: "🎤 You've been challenged to a Verzuz",
    body: `${session.user.name ?? "An artist"} wants to face you in a ${challengerSongIds.length}-round Verzuz${theme ? ` · ${theme}` : ""}. Accept by ${challenge.expiresAt.toLocaleString()}.`,
    metadata: { challengeId: challenge.id, challengerId: session.user.id },
  });

  return NextResponse.json({ ok: true, challenge }, { status: 201 });
}

/**
 * GET /api/verzuz/challenges
 *
 * Lists the caller's Verzuz challenges (sent + received) so the inbox UI
 * can render them next to the existing 1v1 challenges. PENDING and recent
 * resolutions only — older history goes through /verzuz/history.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [received, sent] = await Promise.all([
    prisma.verzuzChallenge.findMany({
      where: {
        opponentId: session.user.id,
        OR: [{ status: "PENDING" }, { createdAt: { gte: since } }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.verzuzChallenge.findMany({
      where: {
        challengerId: session.user.id,
        OR: [{ status: "PENDING" }, { createdAt: { gte: since } }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ received, sent });
}
