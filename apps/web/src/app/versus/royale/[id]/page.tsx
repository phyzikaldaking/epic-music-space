import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import BattleRoyaleCard from "@/components/BattleRoyaleCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const battle = await prisma.battleRoyale.findUnique({
    where: { id },
    include: { entries: { include: { song: { select: { title: true } } }, orderBy: { position: "asc" }, take: 3 } },
  });
  if (!battle) return {};
  const titles = battle.entries.map((e) => e.song.title).join(" vs ");
  return {
    title: `Battle Royale: ${titles} — EMS`,
    description: `Vote on the best track in this ${battle.entries.length}-song battle`,
  };
}

export default async function BattleRoyalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const battle = await prisma.battleRoyale.findUnique({
    where: { id },
    include: {
      entries: {
        include: {
          song: {
            select: {
              id: true, title: true, artist: true, coverUrl: true,
              audioUrl: true, aiScore: true,
            },
          },
        },
        orderBy: { votes: "desc" },
      },
      creator: { select: { name: true } },
    },
  });

  if (!battle) notFound();

  let userVotedSongId: string | null = null;
  if (session?.user?.id) {
    const vote = await prisma.battleRoyaleVote.findUnique({
      where: { battleId_userId: { battleId: id, userId: session.user.id } },
    });
    userVotedSongId = vote?.songId ?? null;
  }

  const totalVotes = battle.entries.reduce((sum, e) => sum + e.votes, 0);
  const isComplete = battle.status === "COMPLETED" || new Date() > battle.endsAt;
  const winner = isComplete && totalVotes > 0 ? battle.entries[0] : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Back */}
      <Link href="/versus" className="mb-8 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition">
        ← All Battles
      </Link>

      {/* Status banner */}
      <div className={`mb-6 rounded-2xl border px-5 py-3 text-sm font-semibold ${
        isComplete
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-green-500/30 bg-green-500/10 text-green-400"
      }`}>
        {isComplete ? "🏆 Battle Complete" : "⚡ Live Battle Royale"}
        {" · "}
        {battle.entries.length} songs
        {" · "}
        {totalVotes} votes
      </div>

      {/* Winner callout */}
      {winner && (
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4">
          <div className="relative h-16 w-16 overflow-hidden rounded-xl flex-shrink-0 bg-gradient-to-br from-brand-900 to-accent-600">
            {winner.song.coverUrl ? (
              <Image src={winner.song.coverUrl} alt={winner.song.title} fill className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl">🎵</span>
            )}
          </div>
          <div>
            <p className="text-xs text-amber-400/70 font-semibold uppercase tracking-widest">Champion</p>
            <p className="text-lg font-extrabold">{winner.song.title}</p>
            <p className="text-sm text-white/60">{winner.song.artist}</p>
          </div>
          <div className="ml-auto text-3xl">🏆</div>
        </div>
      )}

      {/* Battle card (interactive) */}
      <BattleRoyaleCard
        battleId={id}
        entries={battle.entries.map((e) => ({ ...e, position: e.votes }))}
        endsAt={battle.endsAt.toISOString()}
        userVotedSongId={userVotedSongId}
      />

      {/* Share */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/3 p-5">
        <p className="mb-3 text-sm font-semibold text-white/60">Share this battle</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(window.location.href)}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60 hover:text-white transition"
          >
            📋 Copy link
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🏆 Battle Royale: who wins? Vote now!\n${typeof window !== "undefined" ? window.location.href : ""}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/60 hover:text-white transition"
          >
            𝕏 Share on X
          </a>
        </div>
      </div>
    </div>
  );
}
