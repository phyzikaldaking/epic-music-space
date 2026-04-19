"use client";

import { useState } from "react";

interface VersusCardProps {
  matchId: string;
  songA: { id: string; title: string; artist: string; coverUrl?: string | null; aiScore: number };
  songB: { id: string; title: string; artist: string; coverUrl?: string | null; aiScore: number };
  votesA: number;
  votesB: number;
  endsAt: string;
  userVotedSongId?: string | null;
}

export default function VersusCard({
  matchId,
  songA,
  songB,
  votesA: initialVotesA,
  votesB: initialVotesB,
  endsAt,
  userVotedSongId,
}: VersusCardProps) {
  const [votesA, setVotesA] = useState(initialVotesA);
  const [votesB, setVotesB] = useState(initialVotesB);
  const [voted, setVoted] = useState<string | null>(userVotedSongId ?? null);
  const [loading, setLoading] = useState(false);

  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = 100 - pctA;

  const isExpired = new Date(endsAt) < new Date();

  async function vote(songId: string) {
    if (loading || isExpired) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/versus/${matchId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votedSongId: songId }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotesA(data.votesA);
        setVotesB(data.votesB);
        setVoted(songId);
      }
    } finally {
      setLoading(false);
    }
  }

  function SongSide({
    song,
    votes,
    pct,
    side,
  }: {
    song: typeof songA;
    votes: number;
    pct: number;
    side: "A" | "B";
  }) {
    const isVoted = voted === song.id;
    const isLoser = voted && !isVoted;
    return (
      <button
        onClick={() => vote(song.id)}
        disabled={!!voted || isExpired || loading}
        className={`flex flex-1 flex-col items-center gap-3 rounded-2xl border p-5 transition
          ${isVoted ? "border-brand-500 bg-brand-500/20" : "border-white/10 bg-white/5"}
          ${isLoser ? "opacity-50" : ""}
          ${!voted && !isExpired ? "hover:border-brand-500/50 hover:bg-white/10 cursor-pointer" : "cursor-default"}
        `}
      >
        {/* Cover */}
        <div className="relative h-32 w-32 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex-shrink-0">
          {song.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={song.coverUrl} alt={song.title} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-4xl">🎵</span>
          )}
          {side === "A" && (
            <span className="absolute top-2 left-2 rounded-md bg-brand-500 px-1.5 py-0.5 text-xs font-bold">A</span>
          )}
          {side === "B" && (
            <span className="absolute top-2 right-2 rounded-md bg-accent-500 px-1.5 py-0.5 text-xs font-bold">B</span>
          )}
        </div>

        <div className="text-center">
          <p className="font-semibold line-clamp-1">{song.title}</p>
          <p className="text-sm text-white/60">{song.artist}</p>
          <p className="mt-1 text-xs text-white/40">AI Score {song.aiScore.toFixed(1)}</p>
        </div>

        {/* Vote bar (shown after voting) */}
        {voted && (
          <div className="w-full">
            <div className="mb-1 flex justify-between text-xs text-white/60">
              <span>{votes} votes</span>
              <span className="font-bold text-white">{pct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  side === "A" ? "bg-brand-500" : "bg-accent-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between text-xs text-white/40">
        <span>⚔️ VERSUS</span>
        <span>{isExpired ? "Ended" : `Ends ${new Date(endsAt).toLocaleString()}`}</span>
      </div>

      <div className="flex items-center gap-4">
        <SongSide song={songA} votes={votesA} pct={pctA} side="A" />
        <div className="flex-shrink-0 text-center">
          <p className="text-xl font-black text-white/30">VS</p>
        </div>
        <SongSide song={songB} votes={votesB} pct={pctB} side="B" />
      </div>

      {!voted && !isExpired && (
        <p className="mt-4 text-center text-xs text-white/30">
          Tap a song to vote. Votes boost the winner&apos;s discovery score.
        </p>
      )}
    </div>
  );
}
