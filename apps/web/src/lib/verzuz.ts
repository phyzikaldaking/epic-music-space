import { prisma } from "./prisma";
import { CHANNELS, createServerSupabaseClient } from "./supabase";

/**
 * Returns the round that should be active right now for the given match.
 * Auto-closes any earlier rounds whose timer has expired and returns the
 * next live round (or null when the whole match has ended).
 *
 * Single source of truth for "what round is the audience watching" —
 * the page render and the vote endpoint both call this so there's no
 * window where a stale currentRound lets a vote land on a closed round.
 */
export async function advanceMatchIfNeeded(matchId: string) {
  const match = await prisma.verzuzMatch.findUnique({
    where: { id: matchId },
    include: {
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
  if (!match) return null;
  if (match.status === "COMPLETED") return match;

  const now = Date.now();
  const startMs = match.startsAt.getTime();
  if (now < startMs) {
    // Match hasn't started yet — keep status SCHEDULED.
    return match;
  }

  const elapsedSec = Math.floor((now - startMs) / 1000);
  const expectedRoundRaw =
    Math.floor(elapsedSec / match.roundDurationSec) + 1;
  const matchEnded = expectedRoundRaw > match.totalRounds;
  const expectedRound = Math.min(
    match.totalRounds,
    Math.max(1, expectedRoundRaw),
  );

  // Lock any rounds that should have closed by now.
  const closing = match.rounds
    .filter((r) => r.winner === null && r.roundNumber < expectedRoundRaw)
    .map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      winner:
        r.votesA > r.votesB ? "A"
        : r.votesB > r.votesA ? "B"
        : "TIE",
    }));
  for (const round of closing) {
    await prisma.verzuzRound.update({
      where: { id: round.id },
      data: { winner: round.winner },
    });
  }
  if (closing.length > 0) {
    // Keep the in-memory snapshot consistent for callers when we don't
    // end up touching the parent match row below.
    for (const c of closing) {
      const local = match.rounds.find((r) => r.id === c.id);
      if (local) (local as { winner: string | null }).winner = c.winner;
    }
  }

  // Promote currentRound + flip status if needed.
  const newStatus = matchEnded
    ? "COMPLETED"
    : match.status === "SCHEDULED"
      ? "LIVE"
      : match.status;

  const shouldUpdateMatch =
    match.currentRound !== expectedRound ||
    match.status !== newStatus ||
    (matchEnded && !match.endsAt);

  if (
    shouldUpdateMatch
  ) {
    const updated = await prisma.verzuzMatch.update({
      where: { id: matchId },
      data: {
        currentRound: matchEnded ? match.totalRounds : expectedRound,
        status: newStatus,
        endsAt: matchEnded && !match.endsAt ? new Date() : match.endsAt,
      },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });

    // Best-effort realtime state update for every open viewer. This keeps
    // scoreboards and ladders accurate without client polling.
    if (closing.length > 0 || updated.currentRound !== match.currentRound || updated.status !== match.status) {
      void (async () => {
        try {
          const supabase = createServerSupabaseClient();
          if (!supabase) return;
          await supabase.channel(CHANNELS.versus(matchId)).send({
            type: "broadcast",
            event: "verzuz_state",
            payload: {
              matchId,
              currentRound: updated.currentRound,
              status: updated.status,
              endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
              closedRounds: closing,
            },
          });
        } catch {
          /* ignore */
        }
      })();
    }

    return updated;
  }

  if (closing.length > 0) {
    // Broadcast winner locks even when the match row didn't change (rare,
    // but can happen if winners were missing while currentRound/status
    // were already correct).
    void (async () => {
      try {
        const supabase = createServerSupabaseClient();
        if (!supabase) return;
        await supabase.channel(CHANNELS.versus(matchId)).send({
          type: "broadcast",
          event: "verzuz_state",
          payload: {
            matchId,
            currentRound: match.currentRound,
            status: match.status,
            endsAt: match.endsAt ? match.endsAt.toISOString() : null,
            closedRounds: closing,
          },
        });
      } catch {
        /* ignore */
      }
    })();
  }

  return match;
}

/** Tally A vs B round wins. Returns { aWins, bWins, ties }. */
export function tallyRounds(rounds: { winner: string | null }[]) {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  for (const r of rounds) {
    if (r.winner === "A") aWins++;
    else if (r.winner === "B") bWins++;
    else if (r.winner === "TIE") ties++;
  }
  return { aWins, bWins, ties };
}
