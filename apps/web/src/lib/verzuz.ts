import { prisma } from "./prisma";

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
  const expectedRound = Math.min(
    match.totalRounds,
    Math.floor(elapsedSec / match.roundDurationSec) + 1,
  );

  // Lock any rounds that should have closed by now.
  const closing = match.rounds.filter(
    (r) => r.roundNumber < expectedRound && r.winner === null,
  );
  for (const round of closing) {
    const winner =
      round.votesA > round.votesB ? "A"
      : round.votesB > round.votesA ? "B"
      : "TIE";
    await prisma.verzuzRound.update({
      where: { id: round.id },
      data: { winner },
    });
  }

  // Promote currentRound + flip status if needed.
  const matchEnded = expectedRound > match.totalRounds;
  const newStatus = matchEnded
    ? "COMPLETED"
    : match.status === "SCHEDULED"
      ? "LIVE"
      : match.status;

  if (
    match.currentRound !== expectedRound ||
    match.status !== newStatus ||
    (matchEnded && !match.endsAt)
  ) {
    return prisma.verzuzMatch.update({
      where: { id: matchId },
      data: {
        currentRound: matchEnded ? match.totalRounds : expectedRound,
        status: newStatus,
        endsAt: matchEnded && !match.endsAt ? new Date() : match.endsAt,
      },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });
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
