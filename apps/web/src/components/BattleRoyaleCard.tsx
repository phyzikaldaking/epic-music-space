"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { getStreamUrl } from "@/lib/audioStream";

interface Entry {
  id: string;
  songId: string;
  votes: number;
  position: number;
  song: {
    id: string;
    title: string;
    artist: string;
    coverUrl?: string | null;
    aiScore: number;
  };
}

interface BattleRoyaleCardProps {
  battleId: string;
  entries: Entry[];
  endsAt: string;
  userVotedSongId?: string | null;
}

export default function BattleRoyaleCard({
  battleId,
  entries: initialEntries,
  endsAt,
  userVotedSongId,
}: BattleRoyaleCardProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [voted, setVoted] = useState<string | null>(userVotedSongId ?? null);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const isExpired = new Date(endsAt) < new Date();
  const totalVotes = entries.reduce((sum, e) => sum + e.votes, 0);

  const displayEntries = (voted ?? isExpired)
    ? [...entries].sort((a, b) => b.votes - a.votes)
    : [...entries].sort((a, b) => a.position - b.position);

  const cols =
    entries.length <= 3 ? "grid-cols-3" :
    entries.length === 4 ? "grid-cols-4" :
    entries.length <= 6 ? "grid-cols-3 sm:grid-cols-6" :
    "grid-cols-4 sm:grid-cols-5";

  function togglePreview(song: Entry["song"]) {
    if (!song.id) return;
    Object.entries(audioRefs.current).forEach(([id, audio]) => {
      if (id !== song.id) audio?.pause();
    });
    if (!audioRefs.current[song.id]) {
      // Stream-proxy URL — same hardening pattern as VersusCard +
      // AudioPlayer. The raw Supabase URL never appears on the network panel.
      const audio = new Audio(getStreamUrl(song.id));
      audio.volume = 0.8;
      audio.preload = "metadata";
      try {
        audio.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
        audio.setAttribute("disablePictureInPicture", "true");
        audio.crossOrigin = "anonymous";
      } catch {
        /* older browsers — non-fatal */
      }
      audio.addEventListener("ended", () => setPlayingId(null));
      audio.addEventListener("error", () => setPlayingId(null));
      audioRefs.current[song.id] = audio;
    }
    if (playingId === song.id) {
      audioRefs.current[song.id]!.pause();
      setPlayingId(null);
    } else {
      void audioRefs.current[song.id]!.play().catch(() => setPlayingId(null));
      setPlayingId(song.id);
    }
  }

  useEffect(() => {
    const refs = audioRefs.current;
    return () => {
      Object.values(refs).forEach((a) => { if (a) { a.pause(); a.src = ""; } });
    };
  }, []);

  const vote = useCallback(async (songId: string) => {
    if (loading || isExpired || voted) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/versus/royale/${battleId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (res.ok) {
        const data = await res.json() as {
          votedSongId: string;
          entries: { id: string; songId: string; votes: number; position: number }[];
        };
        setEntries((prev) =>
          prev.map((e) => {
            const updated = data.entries.find((u) => u.id === e.id);
            return updated ? { ...e, votes: updated.votes } : e;
          }),
        );
        setVoted(data.votedSongId);
      }
    } finally {
      setLoading(false);
    }
  }, [battleId, loading, isExpired, voted]);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between text-xs text-white/40">
        <span className="flex items-center gap-2">
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-400 uppercase tracking-wide">
            Battle Royale
          </span>
          <span>{entries.length} songs</span>
        </span>
        <span>{isExpired ? "Ended" : `Ends ${new Date(endsAt).toLocaleString()}`}</span>
      </div>

      {/* Song grid */}
      <div className={`grid gap-3 ${cols}`}>
        {displayEntries.map((entry, idx) => {
          const pct = totalVotes > 0 ? Math.round((entry.votes / totalVotes) * 100) : 0;
          const isVoted = voted === entry.songId;
          const isLeader = idx === 0 && (!!voted || isExpired) && totalVotes > 0;

          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => void vote(entry.songId)}
              disabled={!!voted || isExpired || loading}
              className={`relative flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition
                ${isVoted ? "border-brand-500 bg-brand-500/15" : ""}
                ${isLeader && !isVoted ? "border-amber-500/50 bg-amber-500/8" : ""}
                ${!voted && !isExpired ? "border-white/10 bg-white/3 hover:border-brand-500/50 hover:bg-white/8 cursor-pointer" : "cursor-default"}
                ${(!!voted || isExpired) && !isVoted && !isLeader ? "border-white/8 opacity-55" : ""}
              `}
            >
              {isLeader && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-base">🏆</span>
              )}

              <div className="relative h-14 w-14 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900 to-accent-600 flex-shrink-0">
                {entry.song.coverUrl ? (
                  <Image src={entry.song.coverUrl} alt={entry.song.title} fill className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl">🎵</span>
                )}
              </div>

              <p className="text-[11px] font-semibold leading-tight line-clamp-2 text-center">{entry.song.title}</p>
              <p className="text-[10px] text-white/40 line-clamp-1">{entry.song.artist}</p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePreview(entry.song);
                }}
                aria-label={playingId === entry.song.id ? `Pause ${entry.song.title}` : `Preview ${entry.song.title}`}
                className="text-[10px] text-white/30 hover:text-white/60 transition"
              >
                {playingId === entry.song.id ? "⏸" : "▶"}
              </button>

              {(voted ?? isExpired) && (
                <div className="w-full mt-1 space-y-0.5">
                  <p className="text-[11px] font-bold text-white text-center">{pct}%</p>
                  <progress
                    max={100}
                    value={pct}
                    className={`ems-progress h-1 w-full ${
                      isVoted ? "ems-progress-a" : isLeader ? "ems-progress-gold" : "ems-progress-muted"
                    }`}
                    aria-label={`${entry.song.title} vote share`}
                  />
                  <p className="text-[10px] text-white/30 text-center">{entry.votes}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {!voted && !isExpired && (
        <p className="mt-4 text-center text-xs text-white/30">Tap your favorite to vote</p>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-white/30">
        <span>{totalVotes} total votes</span>
        <Link href={`/versus/royale/${battleId}`} className="hover:text-brand-400 transition underline underline-offset-2">
          {isExpired ? "🏆 View results & share" : "🔗 Share this battle"}
        </Link>
      </div>
    </div>
  );
}
