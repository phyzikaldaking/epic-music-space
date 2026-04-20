"use client";

import { useState } from "react";
import AudioPlayer from "@/components/AudioPlayer";

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string | null;
  aiScore: number;
  artistId: string;
}

interface Match {
  id: string;
  votesA: number;
  votesB: number;
  status: string;
  endsAt: Date | string;
  songA: Song;
  songB: Song;
}

export default function VersusResultCard({ match }: { match: Match }) {
  const [copied, setCopied] = useState(false);

  const total = match.votesA + match.votesB;
  const pctA = total > 0 ? Math.round((match.votesA / total) * 100) : 50;
  const pctB = total > 0 ? Math.round((match.votesB / total) * 100) : 50;
  const isCompleted = match.status === "COMPLETED" || new Date(match.endsAt) < new Date();

  const winnerSong = isCompleted
    ? match.votesA >= match.votesB ? match.songA : match.songB
    : null;
  const loserSong = winnerSong?.id === match.songA.id ? match.songB : match.songA;

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const tweetText = winnerSong
    ? `🏆 "${winnerSong.title}" by ${winnerSong.artist} won the EMS Versus battle! Come listen and vote on Epic Music Space ⚔️`
    : `⚔️ "${match.songA.title}" vs "${match.songB.title}" — who wins? Vote now on Epic Music Space!`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`;

  return (
    <div>
      {/* WHO WON? banner */}
      {isCompleted && winnerSong ? (
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/35 mb-2">⚔️ Battle Complete</p>
          <h1 className="text-4xl font-extrabold text-gradient-ems mb-1">
            🏆 {winnerSong.title} Won!
          </h1>
          <p className="text-lg text-white/60">by {winnerSong.artist}</p>
        </div>
      ) : (
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-white/35 mb-2">⚔️ Battle Live</p>
          <h1 className="text-4xl font-extrabold mb-1">WHO WINS?</h1>
          <p className="text-white/50">Vote ends {new Date(match.endsAt).toLocaleString()}</p>
        </div>
      )}

      {/* Battle cards */}
      <div className="mb-8 flex items-stretch gap-4">
        {/* Song A */}
        <SongResultCard
          song={match.songA}
          votes={match.votesA}
          pct={pctA}
          side="A"
          isWinner={isCompleted && winnerSong?.id === match.songA.id}
          isLoser={isCompleted && loserSong?.id === match.songA.id}
        />

        <div className="flex-shrink-0 flex items-center">
          <p className="text-2xl font-black text-white/25">VS</p>
        </div>

        {/* Song B */}
        <SongResultCard
          song={match.songB}
          votes={match.votesB}
          pct={pctB}
          side="B"
          isWinner={isCompleted && winnerSong?.id === match.songB.id}
          isLoser={isCompleted && loserSong?.id === match.songB.id}
        />
      </div>

      {/* Audio previews */}
      {(match.songA.audioUrl || match.songB.audioUrl) && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {match.songA.audioUrl && (
            <AudioPlayer audioUrl={match.songA.audioUrl} title={match.songA.title} />
          )}
          {match.songB.audioUrl && (
            <AudioPlayer audioUrl={match.songB.audioUrl} title={match.songB.title} />
          )}
        </div>
      )}

      {/* Share row */}
      <div className="glass-card rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Share this battle</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void copyShareLink()}
            className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
              copied ? "bg-green-500 text-white" : "bg-brand-500 text-white hover:bg-brand-600"
            } glow-purple-sm`}
          >
            {copied ? "✓ Link Copied!" : "🔗 Copy Link"}
          </button>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white transition"
          >
            𝕏 Share on X
          </a>
          <a
            href="/versus"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/50 hover:bg-white/6 hover:text-white transition"
          >
            ← More Battles
          </a>
          <a
            href="/auth/signup"
            className="rounded-xl bg-accent-500/20 border border-accent-500/40 px-5 py-2.5 text-sm font-semibold text-accent-400 hover:bg-accent-500/30 transition"
          >
            Join EMS Free →
          </a>
        </div>
      </div>
    </div>
  );
}

function SongResultCard({
  song,
  votes,
  pct,
  side,
  isWinner,
  isLoser,
}: {
  song: Song;
  votes: number;
  pct: number;
  side: "A" | "B";
  isWinner: boolean;
  isLoser: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-4 rounded-2xl border p-5 transition ${
        isWinner
          ? "border-gold-500/50 bg-gold-500/8"
          : isLoser
          ? "border-white/8 bg-white/2 opacity-60"
          : "border-white/10 bg-white/4"
      }`}
    >
      {isWinner && (
        <div className="rounded-full bg-gold-500/15 border border-gold-500/40 px-3 py-1 text-xs font-bold text-gold-400">
          🏆 WINNER
        </div>
      )}

      {/* Cover */}
      <div className="relative h-36 w-36 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex-shrink-0">
        {song.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.coverUrl} alt={song.title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-4xl">🎵</span>
        )}
        <span className={`absolute top-2 ${side === "A" ? "left-2" : "right-2"} rounded-md px-1.5 py-0.5 text-xs font-bold ${side === "A" ? "bg-brand-500" : "bg-accent-500"}`}>
          {side}
        </span>
      </div>

      <div className="text-center">
        <p className="font-bold text-lg line-clamp-1">{song.title}</p>
        <p className="text-sm text-white/60">{song.artist}</p>
      </div>

      {/* Vote bar */}
      <div className="w-full">
        <div className="mb-1 flex justify-between text-xs text-white/50">
          <span>{votes.toLocaleString()} votes</span>
          <span className="font-bold text-white">{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full ${side === "A" ? "bg-brand-500" : "bg-accent-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
