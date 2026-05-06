import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudioBackdrop from "@/components/StudioBackdrop";
import RespondVerzuzClient from "./RespondVerzuzClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verzuz challenge — Epic Music Space",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function VerzuzChallengePage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/verzuz/challenge/${id}`);
  }

  const challenge = await prisma.verzuzChallenge.findUnique({
    where: { id },
  });
  if (!challenge) notFound();

  const isOpponent = challenge.opponentId === session.user.id;
  const isChallenger = challenge.challengerId === session.user.id;
  if (!isOpponent && !isChallenger) {
    return (
      <div className="relative min-h-screen">
        <StudioBackdrop status="ENDED" />
        <main className="relative mx-auto max-w-md px-4 py-20 text-center">
          <p className="text-2xl">🔒</p>
          <p className="mt-3 text-lg font-bold text-white">
            This invite isn&apos;t for you.
          </p>
          <p className="mt-1 text-sm text-white/55">
            Only the challenger and the opponent can view this challenge.
          </p>
        </main>
      </div>
    );
  }

  // Resolve participants + every referenced song in one round-trip.
  const [challenger, opponent, songs, mySongs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: challenge.challengerId },
      select: {
        id: true,
        name: true,
        image: true,
        studio: { select: { username: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: challenge.opponentId },
      select: {
        id: true,
        name: true,
        image: true,
        studio: { select: { username: true } },
      },
    }),
    prisma.song.findMany({
      where: {
        id: { in: [...challenge.challengerSongIds, ...challenge.opponentSongIds] },
      },
      select: {
        id: true,
        title: true,
        artist: true,
        coverUrl: true,
      },
    }),
    isOpponent
      ? prisma.song.findMany({
          where: {
            artistId: session.user.id,
            isActive: true,
            isLegacy: false,
          },
          select: {
            id: true,
            title: true,
            coverUrl: true,
            genre: true,
            bpm: true,
          },
          orderBy: { aiScore: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  const songById = new Map(songs.map((s) => [s.id, s]));
  const challengerSetlist = challenge.challengerSongIds
    .map((sid) => songById.get(sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const expired =
    challenge.status === "PENDING" && challenge.expiresAt < new Date();
  const effectiveStatus = expired ? "EXPIRED" : challenge.status;

  return (
    <div className="relative min-h-screen">
      <StudioBackdrop
        status={
          challenge.status === "ACCEPTED" || challenge.status === "PENDING"
            ? "LIVE"
            : "ENDED"
        }
      />

      <main className="relative mx-auto max-w-2xl px-4 py-12">
        <RespondVerzuzClient
          role={isOpponent ? "OPPONENT" : "CHALLENGER"}
          challenge={{
            id: challenge.id,
            status: effectiveStatus,
            theme: challenge.proposedTheme,
            totalRounds: challenge.proposedTotalRounds,
            roundDurationSec: challenge.proposedRoundDurationSec,
            tier: challenge.proposedTier,
            startsAt: challenge.proposedStartsAt.toISOString(),
            expiresAt: challenge.expiresAt.toISOString(),
            message: challenge.message,
            matchId: challenge.matchId,
          }}
          challenger={
            challenger
              ? {
                  name: challenger.name,
                  image: challenger.image,
                  username: challenger.studio?.username ?? null,
                }
              : null
          }
          opponent={
            opponent
              ? {
                  name: opponent.name,
                  image: opponent.image,
                  username: opponent.studio?.username ?? null,
                }
              : null
          }
          challengerSetlist={challengerSetlist}
          mySongs={mySongs}
        />
      </main>
    </div>
  );
}
