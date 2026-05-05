import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceMatchIfNeeded, tallyRounds } from "@/lib/verzuz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/verzuz/[id] — full match snapshot. Auto-advances rounds if
 * the timer expired since the last fetch (cron is the floor; this is
 * the live ceiling for any active viewer).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

  await advanceMatchIfNeeded(id);

  const match = await prisma.verzuzMatch.findUnique({
    where: { id },
    include: {
      artistA: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      artistB: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: {
          songA: {
            select: { id: true, title: true, artist: true, coverUrl: true, genre: true, bpm: true },
          },
          songB: {
            select: { id: true, title: true, artist: true, coverUrl: true, genre: true, bpm: true },
          },
        },
      },
    },
  });
  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Pull this viewer's votes for round-state UI.
  const myVotes = viewerId
    ? await prisma.verzuzVote.findMany({
        where: { matchId: id, voterId: viewerId },
        select: { roundNumber: true, votedSongId: true },
      })
    : [];

  return NextResponse.json({
    match,
    score: tallyRounds(match.rounds),
    myVotes,
  });
}
