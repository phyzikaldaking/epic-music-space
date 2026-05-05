import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { advanceMatchIfNeeded, tallyRounds } from "@/lib/verzuz";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Drives the Verzuz round timer when no viewer is watching. Without
 * this cron, advanceMatchIfNeeded() only runs when a fan opens the
 * page or casts a vote — so a quiet match could stay on round 1 long
 * past its endsAt.
 *
 * Runs every 2 minutes. Picks every match in SCHEDULED or LIVE state
 * whose round timer should have ticked, advances it, and notifies
 * both artists when their match completes.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = Date.now();

  // Pull every match that's either scheduled to start by now or already
  // live with at least one round-duration of slack since startsAt.
  const candidates = await prisma.verzuzMatch.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      startsAt: { lte: new Date(now) },
    },
    select: { id: true, artistAId: true, artistBId: true, artistAName: true, artistBName: true, status: true },
    take: 200,
  });

  let advanced = 0;
  let completed = 0;

  for (const m of candidates) {
    const before = m.status;
    const after = await advanceMatchIfNeeded(m.id);
    if (!after) continue;
    if (after.status !== before) advanced++;
    if (after.status === "COMPLETED" && before !== "COMPLETED") {
      completed++;
      // Final tally + winner notifications. Best-effort, never blocks.
      try {
        const finalRounds = await prisma.verzuzRound.findMany({
          where: { matchId: m.id },
          select: { winner: true },
        });
        const score = tallyRounds(finalRounds);
        const aWon = score.aWins > score.bWins;
        const bWon = score.bWins > score.aWins;
        const tied = !aWon && !bWon;
        const summary = tied
          ? `Tied ${score.aWins}-${score.bWins}.`
          : `Final score ${Math.max(score.aWins, score.bWins)}-${Math.min(score.aWins, score.bWins)}.`;
        await Promise.allSettled([
          enqueueNotification({
            userId: m.artistAId,
            type: "VERZUZ_RESULT",
            title: aWon ? "🏆 Verzuz won!" : tied ? "Verzuz ended in a tie" : "Verzuz ended",
            body: `${aWon ? "You took it." : tied ? "Even split." : `${m.artistBName} took it.`} ${summary}`,
            metadata: { matchId: m.id, won: aWon, tied, score },
          }),
          enqueueNotification({
            userId: m.artistBId,
            type: "VERZUZ_RESULT",
            title: bWon ? "🏆 Verzuz won!" : tied ? "Verzuz ended in a tie" : "Verzuz ended",
            body: `${bWon ? "You took it." : tied ? "Even split." : `${m.artistAName} took it.`} ${summary}`,
            metadata: { matchId: m.id, won: bWon, tied, score },
          }),
        ]);
      } catch (err) {
        console.warn("[verzuz:cron] result notify failed", err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    advanced,
    completed,
    cutoff: new Date(now).toISOString(),
  });
}
