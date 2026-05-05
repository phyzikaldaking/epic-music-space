import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { advanceMatchIfNeeded } from "@/lib/verzuz";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { getRedis } from "@/lib/redis";

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
    function isUniqueViolation(err: unknown) {
      return (
        typeof err === "object" &&
        err !== null &&
        // PrismaClientKnownRequestError has `code`
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      );
    }

    const where = {
      matchId_roundNumber_voterId: {
        matchId,
        roundNumber,
        voterId: session.user.id,
      },
    } as const;

    const existing = await tx.verzuzVote.findUnique({
      where,
      select: { votedSongId: true },
    });

    // Fast path: user re-submits the same pick. No recount, no writes.
    if (existing && existing.votedSongId === votedSongId) {
      const snapshot = await tx.verzuzRound.findUnique({
        where: { id: round.id },
        select: { roundNumber: true, votesA: true, votesB: true },
      });
      // Should never be null, but keep the type honest.
      return snapshot ?? { roundNumber, votesA: 0, votesB: 0 };
    }

    // Delta-based counter updates so we never do an O(n) recount per vote.
    let deltaA = 0;
    let deltaB = 0;
    const newIsA = votedSongId === round.songAId;
    if (!existing) {
      // Race-safe create: if another request sneaks in and creates the row
      // first, fall back to the update path.
      try {
        await tx.verzuzVote.create({
          data: { matchId, roundNumber, voterId: session.user.id, votedSongId },
        });
        deltaA = newIsA ? 1 : 0;
        deltaB = newIsA ? 0 : 1;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const nowExisting = await tx.verzuzVote.findUnique({
          where,
          select: { votedSongId: true },
        });
        if (nowExisting && nowExisting.votedSongId === votedSongId) {
          const snapshot = await tx.verzuzRound.findUnique({
            where: { id: round.id },
            select: { roundNumber: true, votesA: true, votesB: true },
          });
          return snapshot ?? { roundNumber, votesA: 0, votesB: 0 };
        }
        // Treat as a flip from whatever the other request wrote.
        await tx.verzuzVote.update({
          where,
          data: { votedSongId },
        });
        const oldIsA = nowExisting ? nowExisting.votedSongId === round.songAId : false;
        deltaA = (newIsA ? 1 : 0) + (oldIsA ? -1 : 0);
        deltaB = (newIsA ? 0 : 1) + (oldIsA ? 0 : -1);
      }
    } else {
      await tx.verzuzVote.update({
        where,
        data: { votedSongId },
      });
      const oldIsA = existing.votedSongId === round.songAId;
      // A->B or B->A.
      deltaA = (newIsA ? 1 : 0) + (oldIsA ? -1 : 0);
      deltaB = (newIsA ? 0 : 1) + (oldIsA ? 0 : -1);
    }

    const data: { votesA?: { increment?: number; decrement?: number }; votesB?: { increment?: number; decrement?: number } } = {};
    if (deltaA > 0) data.votesA = { increment: deltaA };
    else if (deltaA < 0) data.votesA = { decrement: -deltaA };
    if (deltaB > 0) data.votesB = { increment: deltaB };
    else if (deltaB < 0) data.votesB = { decrement: -deltaB };

    return tx.verzuzRound.update({
      where: { id: round.id },
      data,
      select: { roundNumber: true, votesA: true, votesB: true },
    });
  });

  // Realtime broadcast — every open viewer sees the score move within
  // ~250ms. Best-effort; a flaky channel never blocks the vote response.
  //
  // NOTE: For very large events, broadcasting on every single vote can
  // overwhelm realtime backends. We use Redis (when configured) as a
  // lightweight cross-instance throttle so each (match, round) emits
  // at most ~4 updates/second.
  void (async () => {
    try {
      const supabase = createServerSupabaseClient();
      if (!supabase) return;

      const redis = getRedis();
      if (redis) {
        const throttleKey = `ems:verzuz:broadcast:${matchId}:${updated.roundNumber}`;
        // Only one broadcaster per window across all instances.
        const ok = await redis.set(throttleKey, "1", "PX", 250, "NX");
        if (ok !== "OK") return;
      }

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
