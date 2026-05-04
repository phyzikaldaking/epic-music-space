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
 * Iframe-friendly embeddable view for a versus battle. Use:
 *   <iframe src="https://epicmusicspace.com/versus/{id}/embed"
 *           width="600" height="220"></iframe>
 *
 * Compact, brand-aware, no nav, deep-links back to the live battle on click.
 */
export default async function VersusEmbedPage({ params }: Props) {
  const { id } = await params;
  const match = await prisma.versusMatch.findUnique({
    where: { id },
    include: {
      songA: { select: { id: true, title: true, artist: true, coverUrl: true } },
      songB: { select: { id: true, title: true, artist: true, coverUrl: true } },
    },
  });
  if (!match) notFound();

  const total = match.votesA + match.votesB;
  const pctA = total > 0 ? Math.round((match.votesA / total) * 100) : 50;
  const pctB = 100 - pctA;
  const isCompleted = match.status === "COMPLETED" || match.endsAt < new Date();
  const winnerSong = isCompleted
    ? match.votesA >= match.votesB ? match.songA : match.songB
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a14] p-4">
      <a
        href={`/versus/${id}`}
        target="_top"
        className="block rounded-2xl border border-white/10 bg-gradient-to-br from-[#11091e] via-[#1a0f2e] to-[#0a0a14] p-4 text-white hover:border-brand-500/40 transition"
      >
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45">
          <span className="flex items-center gap-1.5">
            <span className="text-brand-300">⚔</span> EMS Versus
          </span>
          <span className="text-accent-300">{isCompleted ? "FINAL" : "LIVE"}</span>
        </div>

        <div className="flex items-center gap-3">
          <SideChip song={match.songA} pct={pctA} winner={winnerSong?.id === match.songA.id} />
          <span className="text-base font-extrabold text-white/30">VS</span>
          <SideChip song={match.songB} pct={pctB} winner={winnerSong?.id === match.songB.id} />
        </div>

        <p className="mt-3 text-center text-xs text-brand-300">
          {isCompleted ? `${winnerSong?.title} won →` : "Tap to vote →"}
        </p>
      </a>
    </div>
  );
}

function SideChip({
  song,
  pct,
  winner,
}: {
  song: { id: string; title: string; artist: string; coverUrl: string | null };
  pct: number;
  winner: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border p-2 ${
        winner ? "border-gold-500/45 bg-gold-500/8" : "border-white/8 bg-white/3"
      }`}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-900">
        {song.coverUrl ? (
          <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">🎵</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{song.title}</p>
        <p className="truncate text-[10px] text-white/45">{song.artist}</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${winner ? "bg-gold-400" : "bg-gradient-to-r from-brand-500 to-accent-400"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-xs font-bold tabular-nums">{pct}%</span>
    </div>
  );
}
