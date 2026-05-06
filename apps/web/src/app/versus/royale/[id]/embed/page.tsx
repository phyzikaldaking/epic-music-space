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
 * Iframe-friendly embeddable view for a Battle Royale. Use:
 *   <iframe src="https://epicmusicspace.com/versus/royale/{id}/embed"
 *           width="600" height="280"></iframe>
 *
 * Compact, brand-aware, no nav, deep-links back to the live battle on click.
 */
export default async function RoyaleEmbedPage({ params }: Props) {
  const { id } = await params;
  const battle = await prisma.battleRoyale.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          song: {
            select: { id: true, title: true, artist: true, coverUrl: true },
          },
        },
        orderBy: { votes: "desc" },
      },
    },
  });
  if (!battle) notFound();

  const totalVotes = battle.entries.reduce((sum, e) => sum + e.votes, 0);
  const isCompleted =
    battle.status === "COMPLETED" || battle.endsAt < new Date();
  const winnerId = isCompleted && totalVotes > 0 ? battle.entries[0]?.id : null;
  const top = battle.entries.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#0a0a14] p-4">
      <a
        href={`/versus/royale/${id}`}
        target="_top"
        className="block rounded-2xl border border-white/10 bg-gradient-to-br from-[#1f1607] via-[#1a0f2e] to-[#0a0a14] p-4 text-white hover:border-amber-400/40 transition"
      >
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/45">
          <span className="flex items-center gap-1.5">
            <span className="text-amber-300">🏆</span> EMS Royale ·{" "}
            {battle.entries.length} tracks
          </span>
          <span className={isCompleted ? "text-amber-300" : "text-rose-300"}>
            {isCompleted ? "FINAL" : "LIVE"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {top.map((entry) => {
            const pct =
              totalVotes > 0
                ? Math.round((entry.votes / totalVotes) * 100)
                : 0;
            const isWinner = winnerId === entry.id;
            return (
              <div
                key={entry.id}
                className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-2 ${
                  isWinner
                    ? "border-gold-500/55 bg-gold-500/12"
                    : "border-white/10 bg-white/3"
                }`}
              >
                {isWinner && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-base">
                    🏆
                  </span>
                )}
                <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-brand-900">
                  {entry.song.coverUrl ? (
                    <Image
                      src={entry.song.coverUrl}
                      alt=""
                      fill
                      sizes="48px"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl">
                      🎵
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-center text-[10px] font-bold leading-tight">
                  {entry.song.title}
                </p>
                <p className="text-[9px] text-white/45">{entry.song.artist}</p>
                <p
                  className={`text-xs font-black tabular-nums ${
                    isWinner ? "text-gold-300" : "text-white/85"
                  }`}
                >
                  {pct}%
                </p>
              </div>
            );
          })}
        </div>

        <p className="mt-3 text-center text-xs text-amber-300">
          {isCompleted ? "See the full bracket →" : "Tap to vote →"}
        </p>
      </a>
    </div>
  );
}
