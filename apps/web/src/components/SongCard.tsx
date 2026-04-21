"use client";

import { useState, useRef, useEffect } from "react";
import { formatPrice } from "@ems/utils";

interface SongCardProps {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  coverUrl?: string | null;
  audioUrl?: string | null;
  licensePrice: string | number;
  revenueSharePct: string | number;
  soldLicenses: number;
  totalLicenses: number;
  aiScore?: number;
  isTrending?: boolean;
  isBoosted?: boolean;
}

export default function SongCard({
  id,
  title,
  artist,
  genre,
  coverUrl,
  audioUrl,
  licensePrice,
  revenueSharePct,
  soldLicenses,
  totalLicenses,
  aiScore,
  isTrending = false,
  isBoosted = false,
}: SongCardProps) {
  const remaining = totalLicenses - soldLicenses;
  const remainingPct = Math.round((remaining / totalLicenses) * 100);
  const soldOutSoon = remainingPct <= 20;

  // ── Audio preview state ────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  function handlePlayClick(e: React.MouseEvent) {
    e.preventDefault(); // don't navigate to song page
    e.stopPropagation();

    if (!audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.volume = 0.8;

      audioRef.current.addEventListener("timeupdate", () => {
        const a = audioRef.current;
        if (a && a.duration) {
          setProgress((a.currentTime / a.duration) * 100);
        }
      });

      audioRef.current.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
      });
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      void audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <a
      href={`/studio/${id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[#141414] card-hover-neon"
    >
      {/* ── Cover art ─────────────────────────────────── */}
      <div className="relative h-48 w-full overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${title} cover`}
            className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:opacity-100 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-800/60 to-accent-700/40 flex items-center justify-center text-5xl">
            🎵
          </div>
        )}

        {/* Dark gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Play / Pause button overlay */}
        {audioUrl && (
          <button
            type="button"
            onClick={handlePlayClick}
            aria-label={playing ? "Pause preview" : "Play preview"}
            className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          >
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur glow-purple shadow-2xl transition ${
                playing ? "bg-accent-500/90" : "bg-brand-500/90"
              }`}
            >
              {playing ? (
                /* Pause icon */
                <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                /* Play icon */
                <svg className="ml-1 h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          </button>
        )}

        {/* Badges (top row) */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {isTrending && <span className="badge-trending">🔥 Trending</span>}
          {isBoosted  && <span className="badge-boosted">⚡ Boosted</span>}
        </div>

        {/* Genre badge */}
        {genre && (
          <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium text-white/80 backdrop-blur">
            {genre}
          </span>
        )}

        {/* AI Score pill at bottom-left */}
        {aiScore !== undefined && aiScore > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur">
            <span className="text-[10px] text-white/50">AI</span>
            <span className="text-xs font-bold text-brand-400">{aiScore.toFixed(1)}</span>
          </div>
        )}

        {/* Audio progress bar (visible while playing) */}
        {playing && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* ── Info ──────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="font-bold text-white line-clamp-1">{title}</h3>
          <p className="text-sm text-white/50">{artist}</p>
        </div>

        {/* Economics row */}
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-brand-400">
            {formatPrice(licensePrice)} / license
          </span>
          <span className="rounded-full bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-400 border border-gold-500/20">
            {revenueSharePct}% rev share
          </span>
        </div>

        {/* Availability bar */}
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className={soldOutSoon ? "text-red-400 font-semibold" : "text-white/45"}>
              {remaining} of {totalLicenses} left
              {soldOutSoon && " · Almost gone!"}
            </span>
            <span className="text-white/30">{remainingPct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/8">
            <div
              className={`h-full rounded-full transition-all ${
                soldOutSoon
                  ? "bg-gradient-to-r from-red-500 to-orange-400"
                  : "bg-gradient-to-r from-brand-500 to-accent-500"
              }`}
              style={{ width: `${remainingPct}%` }}
            />
          </div>
        </div>

        <button className="mt-auto w-full rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 glow-purple-sm">
          View &amp; License
        </button>
      </div>
    </a>
  );
}
