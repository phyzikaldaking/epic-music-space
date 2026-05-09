"use client";

/**
 * Fullscreen "Now Playing" surface — the iTunes / Apple Music maximize
 * view. Tapping the docked mini-player's expand button mounts this
 * over the page, dimming everything else. Tapping the close button
 * (or pressing Escape) returns to the mini-player.
 *
 * Stays a thin presentation layer on top of `usePlayer()` — all state
 * lives in the existing context, so nothing about audio playback
 * changes when the user expands. They just see a bigger surface for
 * the same player they already know.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayer } from "@/contexts/PlayerContext";

function fmt(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Same deterministic waveform helper the mini-player uses, scaled up.
// Accepts a seed so the same song renders the same waveform across the
// docked + fullscreen surfaces.
function generateWaveform(seed: string, count: number): number[] {
  const bars: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    bars.push(15 + (h % 70));
  }
  return bars;
}

export default function NowPlayingFullscreen({ onClose }: { onClose: () => void }) {
  const {
    currentSong,
    isPlaying,
    isLoading,
    progress,
    currentTime,
    duration,
    volume,
    queue,
    history,
    togglePlay,
    skipNext,
    skipPrev,
    setVolume,
    seekTo,
  } = usePlayer();

  const seekRef = useRef<HTMLDivElement>(null);
  const [seekHover, setSeekHover] = useState<number | null>(null);

  const waveform = useMemo(
    () => (currentSong ? generateWaveform(currentSong.id, 200) : []),
    [currentSong],
  );

  const safeProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(100, progress))
    : 0;

  const handleSeekClick = useCallback(
    (e: React.MouseEvent) => {
      if (!seekRef.current) return;
      const rect = seekRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      seekTo(Math.max(0, Math.min(100, pct)));
    },
    [seekTo],
  );

  const handleSeekMove = useCallback((e: React.MouseEvent) => {
    if (!seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSeekHover(Math.max(0, Math.min(100, pct)));
  }, []);

  // Escape closes — matches the platform convention for modal full-bleed
  // surfaces (Apple Music, Spotify, Tidal all do this).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.code === "Space") {
        const t = e.target as HTMLElement | null;
        // Don't hijack Space from inputs or buttons
        if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "ArrowRight" && (e.ctrlKey || e.metaKey)) skipNext();
      if (e.key === "ArrowLeft" && (e.ctrlKey || e.metaKey)) skipPrev();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, togglePlay, skipNext, skipPrev]);

  // Lock body scroll while open so the underlying page doesn't slide
  // around when the user scrolls inside this view.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!currentSong) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Now playing: ${currentSong.title}`}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#08080d] text-white"
    >
      {/* Ambient backdrop — blurred copy of the cover art for that
          Apple Music depth-of-field vibe. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
        {currentSong.coverUrl && (
          <Image
            src={currentSong.coverUrl}
            alt=""
            fill
            sizes="100vw"
            className="scale-150 object-cover blur-3xl"
            unoptimized
            priority
          />
        )}
        <div className="absolute inset-0 bg-[#08080d]/70" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
          aria-label="Minimize player"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 13H5v-2h14v2z" />
          </svg>
        </button>

        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/45">
            Now playing
          </p>
          {history.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-white/30">
              from your queue
            </p>
          )}
        </div>

        <Link
          href={`/track/${currentSong.id}`}
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
          aria-label="Go to track page"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 3v2h3.59L7.76 14.83l1.41 1.41L19 6.41V10h2V3h-7zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z" />
          </svg>
        </Link>
      </header>

      {/* Main grid: artwork left, info+controls right (stacks on mobile) */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-5 pb-8 sm:px-12 lg:flex-row lg:gap-16">
        {/* Artwork */}
        <div
          className={`relative aspect-square w-full max-w-[min(70vh,520px)] shrink-0 overflow-hidden rounded-3xl shadow-2xl shadow-black/60 ring-1 ring-white/10 transition-transform duration-700 ${
            isPlaying ? "scale-100" : "scale-95"
          }`}
        >
          {currentSong.coverUrl ? (
            <Image
              src={currentSong.coverUrl}
              alt={`${currentSong.title} cover art`}
              fill
              sizes="(max-width: 1024px) 90vw, 520px"
              className="object-cover"
              unoptimized
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-700 to-accent-700 text-7xl">
              🎵
            </div>
          )}
          {/* Play indicator overlay when paused */}
          {!isPlaying && !isLoading && (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition hover:opacity-100 focus:opacity-100"
              aria-label="Play"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-black shadow-2xl">
                <svg className="ml-1 h-9 w-9" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>

        {/* Info + transport */}
        <div className="flex w-full max-w-xl flex-col">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-brand-300">
            Track
          </p>
          <h1 className="mt-2 break-words text-3xl font-extrabold leading-tight sm:text-4xl">
            {currentSong.title}
          </h1>
          <Link
            href={`/track/${currentSong.id}`}
            onClick={onClose}
            className="mt-2 block text-base text-white/70 hover:text-white"
          >
            {currentSong.artist}
          </Link>

          {/* Big waveform scrubber */}
          <div
            ref={seekRef}
            onClick={handleSeekClick}
            onMouseMove={handleSeekMove}
            onMouseLeave={() => setSeekHover(null)}
            className="group relative mt-8 h-16 cursor-pointer"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(safeProgress)}
          >
            <div className="absolute inset-0 flex items-center gap-px">
              {waveform.map((height, i) => {
                const barPct = (i / waveform.length) * 100;
                const played = barPct < safeProgress;
                const hoverTarget = seekHover !== null && barPct < seekHover;
                return (
                  <span
                    key={i}
                    className={`flex-1 rounded transition-all duration-75 ${
                      played
                        ? "bg-gradient-to-t from-brand-400 to-accent-300"
                        : hoverTarget
                          ? "bg-white/30"
                          : "bg-white/10"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
            {seekHover !== null && duration > 0 && (
              <div
                className="absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-2 py-0.5 font-mono text-[10px] text-white/85 shadow-lg"
                style={{ left: `${seekHover}%` }}
              >
                {fmt((seekHover / 100) * duration)}
              </div>
            )}
          </div>

          {/* Time row */}
          <div className="mt-3 flex justify-between text-xs font-mono text-white/45 tabular-nums">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* Transport controls */}
          <div className="mt-6 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={skipPrev}
              disabled={history.length === 0}
              aria-label="Previous song"
              className="text-white/70 transition hover:text-white disabled:opacity-25"
            >
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-2xl transition hover:scale-105"
            >
              {isLoading ? (
                <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-black border-t-transparent" />
              ) : isPlaying ? (
                <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="ml-1 h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={skipNext}
              disabled={queue.length === 0}
              aria-label="Next song"
              className="text-white/70 transition hover:text-white disabled:opacity-25"
            >
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zm10-12h2v12h-2z" />
              </svg>
            </button>
          </div>

          {/* Volume */}
          <div className="mt-8 flex items-center gap-3 text-white/55">
            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3z" />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
            />
            <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </div>

          {/* Up next list */}
          {queue.length > 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/40">
                Up next ({queue.length})
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                {queue.slice(0, 12).map((song, i) => (
                  <li key={`${song.id}-${i}`} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-right text-[10px] font-mono text-white/30">
                      {i + 1}
                    </span>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/5">
                      {song.coverUrl ? (
                        <Image
                          src={song.coverUrl}
                          alt=""
                          width={36}
                          height={36}
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] opacity-40">
                          🎵
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white/85">
                        {song.title}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {song.artist}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
