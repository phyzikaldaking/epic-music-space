import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { requireCronRequest } from "@/lib/routeAuth";

export const runtime = "nodejs";

/**
 * GET /api/cron/verzuz-pre-start
 *
 * Runs every minute. Finds Verzuz matches that:
 *   - are SCHEDULED
 *   - start within the next 5 minutes
 *   - haven't already had the 5-min reminder sent (reminder5mSentAt is
 *     null), so re-running the cron is idempotent.
 *
 * For each match, enqueues a VERZUZ_STARTING_SOON notification to every
 * user who RSVPed (GOING or INTERESTED). enqueueNotification fans out
 * via in-app + email + push (APNs/FCM) so the reminder reaches the
 * platform the user is currently on.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = new Date();
  const fiveMinAhead = new Date(now.getTime() + 5 * 60 * 1000);

  const matches = await prisma.verzuzMatch.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gt: now, lte: fiveMinAhead },
      reminder5mSentAt: null,
    },
    select: {
      id: true,
      artistAName: true,
      artistBName: true,
      theme: true,
      startsAt: true,
      totalRounds: true,
    },
    take: 50,
  });

  if (matches.length === 0) {
    return NextResponse.json({ swept: 0, notified: 0 });
  }

  let notified = 0;
  await Promise.allSettled(
    matches.map(async (match) => {
      const rsvps = await prisma.verzuzRSVP.findMany({
        where: { matchId: match.id },
        select: { userId: true, status: true },
      });

      // Stamp the reminder timestamp BEFORE fan-out so a slow notification
      // path doesn't cause the next minute's cron to re-send. Even if some
      // fan-outs fail we'd rather under-notify than spam.
      await prisma.verzuzMatch.update({
        where: { id: match.id },
        data: { reminder5mSentAt: new Date() },
      });

      if (rsvps.length === 0) return;

      const startsInMin = Math.max(
        1,
        Math.round((match.startsAt.getTime() - Date.now()) / 60_000),
      );
      const headline = `🎤 ${match.artistAName} vs ${match.artistBName}`;
      const body = match.theme
        ? `${match.theme} · ${match.totalRounds}-round Verzuz starts in ${startsInMin} min — drop in.`
        : `${match.totalRounds}-round Verzuz starts in ${startsInMin} min — drop in.`;

      await Promise.allSettled(
        rsvps.map((r) =>
          enqueueNotification({
            userId: r.userId,
            type: "VERZUZ_STARTING_SOON",
            title: headline,
            body,
            metadata: {
              matchId: match.id,
              startsAt: match.startsAt.toISOString(),
              rsvpStatus: r.status,
            },
          }),
        ),
      );
      notified += rsvps.length;
    }),
  );

  return NextResponse.json({ swept: matches.length, notified });
}
