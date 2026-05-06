import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceMatchIfNeeded, tallyRounds } from "@/lib/verzuz";
import VerzuzStage from "./VerzuzStage";
import VerzuzChatPanel from "@/components/verzuz/VerzuzChatPanel";
import VerzuzRSVPButton from "@/components/verzuz/VerzuzRSVPButton";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await prisma.verzuzMatch.findUnique({
    where: { id },
    select: { artistAName: true, artistBName: true, theme: true },
  });
  if (!m) return { title: "Verzuz" };
  const title = `${m.artistAName} vs ${m.artistBName} — Verzuz`;
  const description = m.theme
    ? `${m.theme} · ${m.artistAName} vs ${m.artistBName} live on Epic Music Space.`
    : `${m.artistAName} vs ${m.artistBName} — head-to-head Verzuz battle on Epic Music Space.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "music.song" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function VerzuzPage({ params }: Props) {
  const { id } = await params;
  await advanceMatchIfNeeded(id);
  const session = await auth();
  const viewerId = session?.user?.id ?? null;

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
          songA: { select: { id: true, title: true, artist: true, coverUrl: true, genre: true, bpm: true } },
          songB: { select: { id: true, title: true, artist: true, coverUrl: true, genre: true, bpm: true } },
        },
      },
    },
  });
  if (!match) notFound();

  const myVotes = viewerId
    ? await prisma.verzuzVote.findMany({
        where: { matchId: id, voterId: viewerId },
        select: { roundNumber: true, votedSongId: true },
      })
    : [];

  const score = tallyRounds(match.rounds);
  const isViewerArtist =
    viewerId === match.artistAId || viewerId === match.artistBId;

  return (
    <>
      <VerzuzStage
        matchId={match.id}
        artistA={{
          id: match.artistAId,
          name: match.artistAName,
          image: match.artistA.image,
          isVerified: match.artistA.isVerified,
          studioUsername: match.artistA.studio?.username ?? null,
        }}
        artistB={{
          id: match.artistBId,
          name: match.artistBName,
          image: match.artistB.image,
          isVerified: match.artistB.isVerified,
          studioUsername: match.artistB.studio?.username ?? null,
        }}
        theme={match.theme}
        status={match.status}
        currentRound={match.currentRound}
        totalRounds={match.totalRounds}
        roundDurationSec={match.roundDurationSec}
        startsAt={match.startsAt.toISOString()}
        endsAt={match.endsAt?.toISOString() ?? null}
        rounds={match.rounds.map((r) => ({
          roundNumber: r.roundNumber,
          songA: r.songA,
          songB: r.songB,
          votesA: r.votesA,
          votesB: r.votesB,
          winner: r.winner as "A" | "B" | "TIE" | null,
        }))}
        myVotes={Object.fromEntries(myVotes.map((v) => [v.roundNumber, v.votedSongId]))}
        initialScore={score}
        isViewerArtist={isViewerArtist}
        isAuthed={!!viewerId}
      />

      <section className="mx-auto mt-8 grid max-w-5xl gap-6 px-4 pb-16 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {match.status === "SCHEDULED" && (
            <VerzuzRSVPButton
              matchId={match.id}
              isAuthed={!!viewerId}
              matchScheduled
            />
          )}
        </div>
        <VerzuzChatPanel
          matchId={match.id}
          isAuthed={!!viewerId}
          isArtist={isViewerArtist}
          matchEnded={match.status === "COMPLETED"}
        />
      </section>
    </>
  );
}
