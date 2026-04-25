import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      const winnerSongId = match.votesA >= match.votesB ? match.songA.id : match.songB.id;
      const loserSongId = winnerSongId === match.songA.id ? match.songB.id : match.songA.id;
      const winnerArtist = winnerSongId === match.songA.id ? match.songA : match.songB;
      const loserArtist = winnerSongId === match.songA.id ? match.songB : match.songA;

      await prisma.$transaction([
        prisma.versusMatch.update({
          where: { id: match.id },
          data: { status: "COMPLETED" },
        }),
        prisma.song.update({
          where: { id: winnerSongId },
          data: { versusWins: { increment: 1 } },
        }),
        prisma.song.update({
          where: { id: loserSongId },
          data: { versusLosses: { increment: 1 } },
        }),
      ]);

      await Promise.allSettled([
        enqueueNotification({
          userId: winnerArtist.artistId,
          type: "VERSUS_RESULT",
          title: "Battle won!",
          body: `"${winnerArtist.title}" won the Versus battle with ${match.votesA >= match.votesB ? match.votesA : match.votesB} votes. Your discovery score got a boost!`,
          metadata: { matchId: match.id, won: true },
        }),
        enqueueNotification({
          userId: loserArtist.artistId,
          type: "VERSUS_RESULT",
          title: "Battle ended",
          body: `"${loserArtist.title}" lost the Versus battle. Keep creating and try again!`,
          metadata: { matchId: match.id, won: false },
        }),
      ]);
    }),
  );

  return NextResponse.json({ expired: expired.length });
}
