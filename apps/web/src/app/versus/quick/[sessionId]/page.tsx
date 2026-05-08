import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getQuick1v1Session, parseFallbackQuickSessionId } from "@/lib/quick1v1";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ sessionId: string }>;
};

export const metadata: Metadata = {
  title: "Quick 1v1 Session",
  description: "Two-round random on-site Quick 1v1 battle session.",
};

export default async function Quick1v1SessionPage({ params }: Props) {
  const { sessionId } = await params;

  const persisted = await getQuick1v1Session(sessionId);
  const fallbackIds = parseFallbackQuickSessionId(sessionId);
  const roundMatchIds = persisted?.roundMatchIds ?? fallbackIds;

  if (!roundMatchIds) notFound();

  const matches = await prisma.versusMatch.findMany({
    where: { id: { in: roundMatchIds } },
    include: {
      songA: { select: { id: true, title: true, artist: true } },
      songB: { select: { id: true, title: true, artist: true } },
    },
  });

  if (matches.length === 0) notFound();

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const rounds = roundMatchIds
    .map((id, idx) => {
      const match = matchById.get(id);
      if (!match) return null;
      return { round: idx + 1, match };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const completedRounds = rounds.filter((r) => r.match.status === "COMPLETED").length;
  const totalVotes = rounds.reduce((sum, r) => sum + r.match.votesA + r.match.votesB, 0);
  const allDone = rounds.length > 0 && rounds.every((r) => r.match.status === "COMPLETED");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/versus" className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white">
        ← Back to Battles
      </Link>

      <div className="mb-6 rounded-2xl border border-cyan-400/35 bg-cyan-500/10 px-5 py-4">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200/90">Quick 1v1 Session</p>
        <h1 className="mt-1 text-2xl font-extrabold text-white">2 Rounds · Random Opponents</h1>
        <p className="mt-1 text-sm text-white/70">1 song per round. Both rounds count toward your battle momentum.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-white/75">Progress: {completedRounds}/{rounds.length} complete</span>
          <span className="rounded-full border border-white/20 bg-black/25 px-2.5 py-1 text-white/75">Total votes: {totalVotes}</span>
          <span className={`rounded-full border px-2.5 py-1 ${allDone ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200" : "border-amber-400/35 bg-amber-500/15 text-amber-200"}`}>
            {allDone ? "Session finished" : "Session live"}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {rounds.map((entry) => {
          const { match } = entry;
          const status = match.status === "COMPLETED" ? "Completed" : "Live";
          const total = match.votesA + match.votesB;
          return (
            <Link
              key={match.id}
              href={`/versus/${match.id}`}
              className="block rounded-2xl border border-white/12 bg-white/4 px-4 py-3 transition hover:border-white/25 hover:bg-white/8"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50">Round {entry.round}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{match.songA.title} vs {match.songB.title}</p>
                  <p className="text-xs text-white/55">{match.songA.artist} vs {match.songB.artist}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-bold ${match.status === "COMPLETED" ? "text-emerald-300" : "text-amber-300"}`}>{status}</p>
                  <p className="mt-1 text-xs text-white/60">{match.votesA} - {match.votesB} ({total} votes)</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
