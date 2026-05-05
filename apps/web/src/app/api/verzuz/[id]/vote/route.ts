import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { advanceMatchIfNeeded } from "@/lib/verzuz";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  roundNumber: z.number().int().min(1).max(10),
  votedSongId: z.string().cuid(),
});

/**
 * POST /api/verzuz/[id]/vote
 *
 * Body: { roundNumber, votedSongId }
 *
 * Upserts a vote for the caller on (match, round). Reject when the
 * round isn't currently live, when the caller is one of the two
 * artists, or when the votedSongId isn't one of the two songs in
 * that round. Realtime broadcast on the per-match channel so every
 * open viewer sees the score move live.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { id: matchId } = await params;
  try {
    await moderateLimiter.consume(`verzuz-vote:user:${session.user.id}:${matchId}`);
    await moderateLimiter.consume(`verzuz-vote:ip:${ip}:${matchId}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on this match. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { roundNumber, votedSongId } = parsed.data;

  // Always tick the timer first so a vote landing inside the last
  // millisecond of a closed round is rejected with the right round.
  const match = await advanceMatchIfNeeded(matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "COMPLETED") {
    return NextResponse.json({ error: "This Verzuz has ended." }, { status: 409 });
  }
  if (match.status === "SCHEDULED") {
    return NextResponse.json({ error: "Verzuz hasn't started yet." }, { status: 409 });
  }
  if (match.artistAId === session.user.id || match.artistBId === session.user.id) {
    return NextResponse.json(
      { error: "Artists can't vote in their own Verzuz." },
      { status: 403 },
    );
  }
  if (roundNumber !== match.currentRound) {
    return NextResponse.json(
      { error: `Round ${roundNumber} isn't live right now (round ${match.currentRound} is).` },
      { status: 409 },
    );
  }

  const round = await prisma.verzuzRound.findUnique({
    where: { matchId_roundNumber: { matchId, roundNumber } },
    select: { id: true, songAId: true, songBId: true, winner: true },
  });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.winner) {
    return NextResponse.json({ error: "Round already locked." }, { status: 409 });
  }
  if (votedSongId !== round.songAId && votedSongId !== round.songBId) {
    return NextResponse.json(
      { error: "votedSongId must be one of the two songs in this round." },
      { status: 400 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.verzuzVote.upsert({
      where: {
        matchId_roundNumber_voterId: {
          matchId,
          roundNumber,
          voterId: session.user.id,
        },
      },
      create: { matchId, roundNumber, voterId: session.user.id, votedSongId },
      update: { votedSongId },
    });
    const [votesA, votesB] = await Promise.all([
      tx.verzuzVote.count({ where: { matchId, roundNumber, votedSongId: round.songAId } }),
      tx.verzuzVote.count({ where: { matchId, roundNumber, votedSongId: round.songBId } }),
    ]);
    return tx.verzuzRound.update({
      where: { id: round.id },
      data: { votesA, votesB },
      select: { roundNumber: true, votesA: true, votesB: true },
    });
  });

  // Realtime broadcast — every open viewer sees the score move within
  // ~50ms. Best-effort; a flaky channel never blocks the vote response.
  void (async () => {
    try {
      const supabase = createServerSupabaseClient();
      if (!supabase) return;
      await supabase.channel(CHANNELS.versus(matchId)).send({
        type: "broadcast",
        event: "verzuz_vote",
        payload: {
          matchId,
          roundNumber: updated.roundNumber,
          votesA: updated.votesA,
          votesB: updated.votesB,
        },
      });
    } catch {
      /* ignore */
    }
  })();

  return NextResponse.json({
    roundNumber: updated.roundNumber,
    votesA: updated.votesA,
    votesB: updated.votesB,
  });
}
