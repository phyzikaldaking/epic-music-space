import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { requireCronRequest } from "@/lib/routeAuth";
import { awardBadge } from "@/lib/badges";

export const runtime = "nodejs";

const WINNER_BOOST = 50; // boost score awarded to the winning track

interface NotifyParticipantArgs {
  userId: string;
  songTitle: string;
  matchId: string;
  won: boolean;
  votesYours: number;
  votesTheirs: number;
}

async function notifyParticipant({ userId, songTitle, matchId, won, votesYours, votesTheirs }: NotifyParticipantArgs) {
  await enqueueNotification({
    userId,
    type: "VERSUS_RESULT",
    title: won ? "🏆 Battle won!" : "Battle ended",
    body: won
      ? `"${songTitle}" won ${votesYours} to ${votesTheirs}. We bumped its boost score and added a battle badge to your profile.`
      : `"${songTitle}" came up short ${votesYours} to ${votesTheirs}. Run it back at /versus/new.`,
    metadata: { matchId, won, votesYours, votesTheirs },
  });
}

export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const expired = await prisma.versusMatch.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { lte: new Date() },
    },
    include: {
      songA: { select: { id: true, artistId: true, title: true } },
      songB: { select: { id: true, artistId: true, title: true } },
    },
    take: 50,
  });

  if (expired.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  await Promise.allSettled(
    expired.map(async (match) => {
      const tie = match.votesA === match.votesB;
      const winnerIsA = match.votesA >= match.votesB;
      const winnerSongId = winnerIsA ? match.songA.id : match.songB.id;
      const loserSongId = winnerIsA ? match.songB.id : match.songA.id;
      const winnerArtist = winnerIsA ? match.songA : match.songB;
      const loserArtist = winnerIsA ? match.songB : match.songA;
      const votesWinner = winnerIsA ? match.votesA : match.votesB;
      const votesLoser = winnerIsA ? match.votesB : match.votesA;

      await prisma.$transaction([
        prisma.versusMatch.update({
          where: { id: match.id },
          data: { status: "COMPLETED" },
        }),
        // Award the W/L counters
        prisma.song.update({
          where: { id: winnerSongId },
          data: { versusWins: { increment: 1 } },
        }),
        prisma.song.update({
          where: { id: loserSongId },
          data: { versusLosses: { increment: 1 } },
        }),
        // Boost-score bump for the winning track. (We don't decay it on a
        // schedule — the existing auction-cycle reset cron clears it weekly.)
        prisma.song.update({
          where: { id: winnerSongId },
          data: { boostScore: { increment: WINNER_BOOST } },
        }),
      ]);

      // Award the FIRST_BATTLE_WIN badge if the winner doesn't already have
      // it. awardBadge is idempotent — duplicates no-op.
      if (!tie) {
        await awardBadge(winnerArtist.artistId, "FIRST_BATTLE_WIN").catch(() => null);
      }

      await Promise.allSettled([
        notifyParticipant({
          userId: winnerArtist.artistId,
          songTitle: winnerArtist.title,
          matchId: match.id,
          won: !tie,
          votesYours: votesWinner,
          votesTheirs: votesLoser,
        }),
        notifyParticipant({
          userId: loserArtist.artistId,
          songTitle: loserArtist.title,
          matchId: match.id,
          won: false,
          votesYours: votesLoser,
          votesTheirs: votesWinner,
        }),
      ]);
    }),
  );

  return NextResponse.json({ expired: expired.length });
}
