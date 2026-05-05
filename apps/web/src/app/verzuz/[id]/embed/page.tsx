import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const revalidate = 30;

/**
 * Iframe-friendly embeddable view for a Verzuz match. Use:
 *   <iframe src="https://epicmusicspace.com/verzuz/{id}/embed"
 *           width="600" height="240"></iframe>
 */
export default async function VerzuzEmbedPage({ params }: Props) {
  const { id } = await params;
  const match = await prisma.verzuzMatch.findUnique({
    where: { id },
    include: {
      artistA: { select: { name: true, image: true } },
      artistB: { select: { name: true, image: true } },
      rounds: { select: { winner: true } },
    },
  });
  if (!match) notFound();

  const roundsWonA = match.rounds.filter((r) => r.winner === "A").length;
  const roundsWonB = match.rounds.filter((r) => r.winner === "B").length;
  const isCompleted = match.status === "COMPLETED";
  const winnerSide = isCompleted
    ? roundsWonA > roundsWonB
      ? "A"
      : roundsWonB > roundsWonA
        ? "B"
        : "TIE"
    : null;

  const statusLabel =
    match.status === "LIVE"
      ? "LIVE NOW"
      : match.status === "COMPLETED"
        ? "FINAL"
        : `IN ${formatDelta(match.startsAt)}`;

  return (
    <div className="min-h-screen bg-[#0a0a14] p-4">
      <a
        href={`/verzuz/${id}`}
        target="_top"
        className="block rounded-2xl border border-white/10 bg-gradient-to-br from-[#11091e] via-[#1a0f2e] to-[#0a0a14] p-4 text-white hover:border-brand-500/40 transition"
      >
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45">
          <span className="flex items-center gap-1.5">
            <span className="text-brand-300">🎤</span> EMS Verzuz
          </span>
          <span className={match.status === "LIVE" ? "text-rose-300" : "text-accent-300"}>
            {statusLabel}
          </span>
        </div>

        {match.theme && (
          <p className="mb-2 text-center text-[11px] font-bold text-white/65">
            {match.theme}
          </p>
        )}

        <div className="flex items-center gap-3">
          <ArtistChip
            name={match.artistAName ?? match.artistA.name ?? "Artist A"}
            image={match.artistA.image}
            roundsWon={roundsWonA}
            totalRounds={match.totalRounds}
            isWinner={winnerSide === "A"}
          />
          <span className="text-base font-extrabold text-white/30">VS</span>
          <ArtistChip
            name={match.artistBName ?? match.artistB.name ?? "Artist B"}
            image={match.artistB.image}
            roundsWon={roundsWonB}
            totalRounds={match.totalRounds}
            isWinner={winnerSide === "B"}
          />
        </div>

        <p className="mt-3 text-center text-xs text-brand-300">
          {match.status === "SCHEDULED"
            ? "Tap to RSVP →"
            : isCompleted
              ? "See the final tally →"
              : `Round ${Math.min(match.currentRound, match.totalRounds)} live — tap to vote →`}
        </p>
      </a>
    </div>
  );
}

function ArtistChip({
  name,
  image,
  roundsWon,
  totalRounds,
  isWinner,
}: {
  name: string;
  image: string | null;
  roundsWon: number;
  totalRounds: number;
  isWinner: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border p-2 ${
        isWinner ? "border-gold-500/45 bg-gold-500/8" : "border-white/8 bg-white/3"
      }`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-brand-900">
        {image ? (
          <Image src={image} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">🎤</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{name}</p>
        <p className="text-[10px] text-white/45">
          {roundsWon} / {totalRounds} rounds
        </p>
      </div>
      <span className={`text-base font-black tabular-nums ${isWinner ? "text-gold-300" : "text-white/85"}`}>
        {roundsWon}
      </span>
    </div>
  );
}

function formatDelta(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return "PRE-SHOW";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
