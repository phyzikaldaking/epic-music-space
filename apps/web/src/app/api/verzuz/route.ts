import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const createSchema = z.object({
  artistBId: z.string().cuid(),
  theme: z.string().min(2).max(80).optional(),
  // Verzuz is a scheduled 10-round event format.
  songsA: z.array(z.string().cuid()).length(10),
  songsB: z.array(z.string().cuid()).length(10),
  // Round duration; defaults to 3 min, capped at 10 to keep the
  // ladder honest. Voting + auto-advance both honor this.
  roundDurationSec: z.number().int().min(60).max(600).optional(),
  // ISO timestamp when the match goes live. Past values fall back to
  // "now" so a creator can kick off immediately.
  startsAt: z.string().datetime().optional(),
});

/**
 * GET /api/verzuz
 *   Public list of LIVE + recently-completed Verzuz matches.
 *
 * POST /api/verzuz
 *   Create a Verzuz match. Caller is artistA. artistBId must own at
 *   least one of the songsB. Both song lists must be the same length;
 *   rounds are zipped 1:1 in the order provided.
 */
export async function GET() {
  const matches = await prisma.verzuzMatch.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "COMPLETED"] } },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 30,
    include: {
      artistA: { select: { id: true, name: true, image: true, isVerified: true } },
      artistB: { select: { id: true, name: true, image: true, isVerified: true } },
      _count: { select: { rounds: true, votes: true } },
    },
  });
  return NextResponse.json({ matches });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["ARTIST", "PRODUCER"].includes(session.user.role)) {
    return NextResponse.json(
      { error: "Only artists and producers can stage a scheduled Verzuz event." },
      { status: 403 },
    );
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`verzuz-create:${session.user.id}`);
    await strictLimiter.consume(`verzuz-create:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on Verzuz creation. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { artistBId, theme, songsA, songsB, roundDurationSec, startsAt } = parsed.data;
  if (artistBId === session.user.id) {
    return NextResponse.json(
      { error: "Pick a different artist for the other side." },
      { status: 400 },
    );
  }
  if (songsA.length !== songsB.length) {
    return NextResponse.json(
      { error: "Both setlists must be the same length." },
      { status: 400 },
    );
  }
  if (new Set(songsA).size !== songsA.length) {
    return NextResponse.json(
      { error: "Your setlist can't include the same song twice." },
      { status: 400 },
    );
  }
  if (new Set(songsB).size !== songsB.length) {
    return NextResponse.json(
      { error: "Opponent setlist can't include the same song twice." },
      { status: 400 },
    );
  }

  const start = startsAt ? new Date(startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) {
    return NextResponse.json(
      { error: "Verzuz requires a valid scheduled start time." },
      { status: 400 },
    );
  }
  if (start.getTime() <= Date.now() + 60_000) {
    return NextResponse.json(
      { error: "Verzuz events must be scheduled at least 1 minute ahead." },
      { status: 400 },
    );
  }

  // Verify ownership: every songsA must belong to artistA (caller),
  // every songsB to artistBId. Stops a bad actor from staging someone
  // else's catalog without consent.
  const [aOwned, bOwned, artistB] = await Promise.all([
    prisma.song.findMany({
      where: { id: { in: songsA }, artistId: session.user.id, isActive: true },
      select: { id: true },
    }),
    prisma.song.findMany({
      where: { id: { in: songsB }, artistId: artistBId, isActive: true },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { id: artistBId },
      select: { id: true, name: true },
    }),
  ]);
  if (!artistB) {
    return NextResponse.json({ error: "Opponent not found." }, { status: 404 });
  }
  if (aOwned.length !== songsA.length) {
    return NextResponse.json(
      { error: "Some of your songs aren't yours or aren't active." },
      { status: 400 },
    );
  }
  if (bOwned.length !== songsB.length) {
    return NextResponse.json(
      { error: "Some of your opponent's songs don't belong to them or aren't active." },
      { status: 400 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true },
  });
  const created = await prisma.$transaction(async (tx) => {
    const match = await tx.verzuzMatch.create({
      data: {
        artistAId: session.user.id,
        artistBId,
        artistAName: me?.name ?? "Artist A",
        artistBName: artistB.name ?? "Artist B",
        theme: theme ?? null,
        totalRounds: songsA.length,
        roundDurationSec: roundDurationSec ?? 180,
        startsAt: start,
        status: "SCHEDULED",
      },
    });
    await tx.verzuzRound.createMany({
      data: songsA.map((songAId, i) => ({
        matchId: match.id,
        roundNumber: i + 1,
        songAId,
        songBId: songsB[i],
      })),
    });
    return match;
  });

  return NextResponse.json({ match: created }, { status: 201 });
}
