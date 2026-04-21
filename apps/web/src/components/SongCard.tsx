"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@ems/utils";

type PriceLike = string | number | { toString(): string };

interface SongCardProps {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  coverUrl?: string | null;
  audioUrl?: string | null;
  licensePrice: PriceLike;
  revenueSharePct: PriceLike;
  soldLicenses: number;
  totalLicenses: number;
  bpm?: number | null;
  musicalKey?: string | null;
  aiScore?: number;
  isTrending?: boolean;
  isBoosted?: boolean;
}

function displayPrice(value: PriceLike) {
  return formatPrice(typeof value === "number" || typeof value === "string" ? value : value.toString());
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
  bpm,
  musicalKey,
  aiScore,
  isTrending = false,
  isBoosted = false,
}: SongCardProps) {
  const remaining = Math.max(0, totalLicenses - soldLicenses);
  const remainingPct =
    totalLicenses > 0 ? Math.round((remaining / totalLicenses) * 100) : 0;
  const soldOutSoon = totalLicenses > 0 && remainingPct <= 20;
  const revenueShare = revenueSharePct.toString();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  function handlePlayClick() {
    if (!audioUrl || audioError) return;

    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audio.preload = "metadata";
      audio.volume = 0.8;

      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      });

      audio.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
        audio.currentTime = 0;
      });

      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("error", () => {
        setAudioError(true);
        setPlaying(false);
      });

      audioRef.current = audio;
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    void audioRef.current
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        setAudioError(true);
        setPlaying(false);
      });
  }

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-white/8 bg-[#141414] transition hover:border-brand-500/50 hover:shadow-[0_12px_40px_rgba(0,0,0,0.36)]">
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-brand-900/70 to-accent-700/40">
        {coverUrl ? (
          // User-provided cover URLs can come from multiple storage providers.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt={`${title} cover art`}
            width={640}
            height={640}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-[0.86] transition duration-300 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              aria-hidden="true"
              className="h-16 w-16 text-white/42"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
            </svg>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/76 via-black/8 to-transparent" />

        {audioUrl && (
          <button
            type="button"
            onClick={handlePlayClick}
            disabled={audioError}
            aria-label={
              audioError
                ? "Preview unavailable"
                : playing
                  ? `Pause ${title} preview`
                  : `Play ${title} preview`
            }
            title={audioError ? "Preview unavailable" : undefined}
            className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full shadow-2xl backdrop-blur transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${
              audioError ? "bg-white/20" : playing ? "bg-accent-500/95" : "bg-brand-500/95"
            }`}
          >
            {audioError ? (
              <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            ) : playing ? (
              <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {isTrending && <span className="badge-trending">Trending</span>}
          {isBoosted && <span className="badge-boosted">Boosted</span>}
        </div>

        {aiScore !== undefined && aiScore > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur">
            <span className="text-[10px] text-white/50">EMS</span>
            <span className="text-xs font-bold text-brand-300">{aiScore.toFixed(1)}</span>
          </div>
        )}

        {playing && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10" aria-hidden="true">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div>
          <Link
            href={`/track/${id}`}
            className="line-clamp-1 font-bold text-white transition hover:text-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            {title}
          </Link>
          <p className="mt-1 line-clamp-1 text-sm text-white/50">{artist}</p>
        </div>

        <div className="flex min-h-7 flex-wrap gap-1.5">
          {genre && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">
              {genre}
            </span>
          )}
          {bpm && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">
              {bpm} BPM
            </span>
          )}
          {musicalKey && (
            <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">
              Key {musicalKey}
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3 text-sm">
          <span className="font-bold text-brand-300">
            {displayPrice(licensePrice)} / license
          </span>
          <span className="rounded-full border border-gold-500/20 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-300">
            {revenueShare}% rev share
          </span>
        </div>

        <div>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span className={soldOutSoon ? "font-semibold text-red-300" : "text-white/45"}>
              {remaining} of {totalLicenses} left
              {soldOutSoon && " · Almost gone"}
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

        <Link
          href={`/track/${id}`}
          className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 glow-purple-sm"
        >
          View &amp; License
        </Link>
      </div>
    </article>
  );
}
