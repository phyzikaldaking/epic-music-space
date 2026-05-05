"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import { useSession } from "next-auth/react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";
import { getStreamUrl } from "@/lib/audioStream";

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

const TIP_AMOUNTS = [1, 5, 10] as const;

export default function VersusResultCard({ match }: { match: Match }) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [votesA, setVotesA] = useState(match.votesA);
  const [votesB, setVotesB] = useState(match.votesB);
  const [voted, setVoted] = useState<string | null>(null);
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tipBusy, setTipBusy] = useState(false);

  const isOwnerArtist =
    !!session?.user?.id &&
    (session.user.id === match.songA.artistId || session.user.id === match.songB.artistId);

  // Live countdown — tick every second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Realtime vote updates — subscribe to the per-match Supabase channel.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase.channel(CHANNELS.versus(match.id));
    channel.on("broadcast", { event: "vote_update" }, (msg) => {
      const payload = msg.payload as { votesA?: number; votesB?: number };
      if (typeof payload.votesA === "number") setVotesA(payload.votesA);
      if (typeof payload.votesB === "number") setVotesB(payload.votesB);
    });
    void channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [match.id]);

  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = 100 - pctA;
  const endsAtMs = new Date(match.endsAt).getTime();
  const remainingMs = endsAtMs - now;
  const isCompleted = match.status === "COMPLETED" || remainingMs <= 0;
  const winnerSong = isCompleted
    ? votesA >= votesB ? match.songA : match.songB
    : null;
  const loserSong = winnerSong?.id === match.songA.id ? match.songB : match.songA;

  function fmtRemaining(ms: number): string {
    if (ms <= 0) return "ended";
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds.toString().padStart(2, "0")}s`;
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  async function vote(songId: string) {
    if (voteBusy || isOwnerArtist || isCompleted) return;
    if (!session?.user?.id) {
      window.location.href = `/auth/signin?callbackUrl=/versus/${match.id}`;
      return;
    }
    setVoteBusy(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/versus/${match.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votedSongId: songId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Vote failed.");
      setVoted(songId);
      // Realtime broadcast will refresh counts; if it doesn't, optimistic
      // update keeps the user feeling responsive.
      if (songId === match.songA.id) setVotesA((v) => v + 1);
      else setVotesB((v) => v + 1);
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Vote failed.");
    } finally {
      setVoteBusy(false);
    }
  }

  async function tipWithVote(songId: string, amount: number) {
    if (tipBusy || isCompleted) return;
    if (!session?.user?.id) {
      window.location.href = `/auth/signin?callbackUrl=/versus/${match.id}`;
      return;
    }
    setTipBusy(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/versus/${match.id}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ votedSongId: songId, amountUsd: amount }),
      });
      const data = (await res.json()) as { error?: string; checkoutUrl?: string };
      if (!res.ok || !data.checkoutUrl) throw new Error(data.error ?? "Tip failed.");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : "Tip failed.");
      setTipBusy(false);
    }
  }

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
      {/* Live status banner */}
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
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-white/35">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Battle Live
          </p>
          <h1 className="mb-2 text-4xl font-extrabold">WHO WINS?</h1>
          <p className="text-base font-bold text-accent-300 tabular-nums">
            ends in {fmtRemaining(remainingMs)}
          </p>
        </div>
      )}

      {/* Battle cards */}
      <div className="mb-8 flex items-stretch gap-4">
        <SongResultCard
          song={match.songA}
          votes={votesA}
          pct={pctA}
          side="A"
          isWinner={isCompleted && winnerSong?.id === match.songA.id}
          isLoser={isCompleted && loserSong?.id === match.songA.id}
          canVote={!isOwnerArtist && !isCompleted}
          voted={voted === match.songA.id}
          onVote={() => vote(match.songA.id)}
          onTip={(amt) => tipWithVote(match.songA.id, amt)}
          voteBusy={voteBusy}
          tipBusy={tipBusy}
        />
        <div className="flex-shrink-0 flex items-center">
          <p className="text-2xl font-black text-white/25">VS</p>
        </div>
        <SongResultCard
          song={match.songB}
          votes={votesB}
          pct={pctB}
          side="B"
          isWinner={isCompleted && winnerSong?.id === match.songB.id}
          isLoser={isCompleted && loserSong?.id === match.songB.id}
          canVote={!isOwnerArtist && !isCompleted}
          voted={voted === match.songB.id}
          onVote={() => vote(match.songB.id)}
          onTip={(amt) => tipWithVote(match.songB.id, amt)}
          voteBusy={voteBusy}
          tipBusy={tipBusy}
        />
      </div>

      {voteError && (
        <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {voteError}
        </p>
      )}

      {isOwnerArtist && (
        <p className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
          You can&apos;t vote on a battle featuring your own track.
        </p>
      )}

      {/* Audio previews — proxied through stream URL */}
      {(match.songA.audioUrl || match.songB.audioUrl) && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {match.songA.audioUrl && (
            <AudioPlayer
              audioUrl={getStreamUrl(match.songA.id)}
              title={match.songA.title}
              songId={match.songA.id}
            />
          )}
          {match.songB.audioUrl && (
            <AudioPlayer
              audioUrl={getStreamUrl(match.songB.id)}
              title={match.songB.title}
              songId={match.songB.id}
            />
          )}
        </div>
      )}

      {/* Signup CTA for logged-out visitors */}
      {!session && (
        <div className="mb-6 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-6 py-5 text-center">
          <p className="mb-3 text-sm font-semibold text-white/80">
            {isCompleted ? "Want to vote on the next battle?" : "Join to vote and support your favourite artist."}
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href={`/auth/signup?callbackUrl=/versus/${match.id}`}
              className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600 transition"
            >
              Sign up free
            </Link>
            <Link
              href={`/auth/signin?callbackUrl=/versus/${match.id}`}
              className="rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold text-white/70 hover:bg-white/8 hover:text-white transition"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Share row */}
      <div className="glass-card rounded-2xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Share this battle</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
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
          <Link
            href={`/versus/${match.id}/embed`}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/70 hover:bg-white/6 hover:text-white transition"
          >
            ⌗ Embed
          </Link>
          <Link
            href="/versus"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/50 hover:bg-white/6 hover:text-white transition"
          >
            ← More Battles
          </Link>
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
  canVote,
  voted,
  onVote,
  onTip,
  voteBusy,
  tipBusy,
}: {
  song: Song;
  votes: number;
  pct: number;
  side: "A" | "B";
  isWinner: boolean;
  isLoser: boolean;
  canVote: boolean;
  voted: boolean;
  onVote: () => void;
  onTip: (amount: number) => void;
  voteBusy: boolean;
  tipBusy: boolean;
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

      <div className="relative h-36 w-36 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex-shrink-0">
        {song.coverUrl ? (
          <Image src={song.coverUrl} alt={song.title} fill className="object-cover" unoptimized />
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

      <div className="w-full">
        <div className="mb-1 flex justify-between text-xs text-white/50">
          <span className="tabular-nums">{votes.toLocaleString()} votes</span>
          <span className="font-bold text-white tabular-nums">{pct}%</span>
        </div>
        <progress
          max={100}
          value={pct}
          className={`ems-progress h-2 w-full ${side === "A" ? "ems-progress-a" : "ems-progress-b"}`}
          aria-label={`${side} vote share`}
        />
      </div>

      {canVote && (
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={onVote}
            disabled={voteBusy || voted}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              voted
                ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                : "bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
            }`}
          >
            {voted ? "✓ Vote locked in" : voteBusy ? "Voting…" : `Vote ${song.title}`}
          </button>
          <div className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span>Tip with vote:</span>
            {TIP_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => onTip(amt)}
                disabled={tipBusy}
                className="rounded-md border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-pink-300 hover:bg-pink-500/20 disabled:opacity-50"
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
