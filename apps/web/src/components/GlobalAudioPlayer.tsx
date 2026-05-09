"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useCallback, useMemo } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import NowPlayingFullscreen from "./NowPlayingFullscreen";

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Deterministic "waveform" bars seeded from song ID — gives each song a
// unique visual signature on the seek bar, like SoundCloud.
function generateWaveform(id: string, count: number): number[] {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 16807 + 11) % 2147483647;
    bars.push(25 + (Math.abs(seed) % 75)); // 25–100 range
  }
  return bars;
}

export default function GlobalAudioPlayer() {
  const {
    currentSong,
    isPlaying,
    isLoading,
    progress,
    currentTime,
    duration,
    volume,
    queue,
    togglePlay,
    skipNext,
    skipPrev,
    setVolume,
    seekTo,
  } = usePlayer();

  const [showQueue, setShowQueue] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [seekHover, setSeekHover] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const seekRef = useRef<HTMLDivElement>(null);

  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;

  const waveform = useMemo(
    () => (currentSong ? generateWaveform(currentSong.id, 80) : []),
    [currentSong],
  );

  const handleSeekMove = useCallback((e: React.MouseEvent) => {
    if (!seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSeekHover(Math.max(0, Math.min(100, pct)));
  }, []);

  const handleSeekClick = useCallback((e: React.MouseEvent) => {
    if (!seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    seekTo(Math.max(0, Math.min(100, pct)));
  }, [seekTo]);

  if (!currentSong) return null;

  return (
    <>
      {/* Queue drawer */}
      {showQueue && queue.length > 0 && (
        <div className="fixed bottom-[5.5rem] right-4 z-50 w-72 overflow-hidden rounded-2xl border border-white/15 bg-[#111118]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">
              Up next ({queue.length})
            </p>
            <button
              type="button"
              onClick={() => setShowQueue(false)}
              className="text-white/40 hover:text-white transition text-sm"
            >
              ✕
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {queue.map((song, i) => (
              <div key={song.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition">
                <span className="w-4 shrink-0 text-xs text-white/30 font-bold">{i + 1}</span>
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md bg-brand-900">
                  {song.coverUrl ? (
                    <Image src={song.coverUrl} alt="" width={32} height={32} className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs">
                      <svg className="h-4 w-4 text-white/30" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" /></svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white/90">{song.title}</p>
                  <p className="truncate text-[10px] text-white/40">{song.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ambient glow behind player — color derived from cover art */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 h-32 transition-opacity duration-1000"
        style={{ opacity: isPlaying ? 0.35 : 0 }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-brand-500/30 via-accent-500/10 to-transparent blur-2xl" />
      </div>

      {/* Player bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0a0a10]/95 backdrop-blur-2xl">
        {/* Waveform seek bar — click to seek, hover shows time */}
        <div
          ref={seekRef}
          className="relative h-3 w-full cursor-pointer group"
          onClick={handleSeekClick}
          onMouseMove={handleSeekMove}
          onMouseLeave={() => setSeekHover(null)}
        >
          {/* Waveform background */}
          <div className="absolute inset-0 flex items-end gap-px px-0">
            {waveform.map((height, i) => {
              const barPct = (i / waveform.length) * 100;
              const played = barPct < safeProgress;
              const hoverTarget = seekHover !== null && barPct < seekHover;
              return (
                <span
                  key={i}
                  className={`flex-1 rounded-t-sm transition-all duration-75 ${
                    played
                      ? "bg-gradient-to-t from-brand-500 to-accent-400"
                      : hoverTarget
                        ? "bg-white/25"
                        : "bg-white/8"
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          {/* Hover time tooltip */}
          {seekHover !== null && duration > 0 && (
            <div
              className="absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-2 py-0.5 text-[10px] font-mono text-white/80 shadow-lg"
              style={{ left: `${seekHover}%` }}
            >
              {fmt((seekHover / 100) * duration)}
            </div>
          )}
        </div>

        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5">
          {/* Song info — larger artwork */}
          <Link href={`/track/${currentSong.id}`} className="flex min-w-0 flex-1 items-center gap-3 group">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-900 shadow-lg shadow-brand-500/10 ring-1 ring-white/10">
              {currentSong.coverUrl ? (
                <Image
                  src={currentSong.coverUrl}
                  alt={currentSong.title}
                  fill
                  className={`object-cover transition-transform duration-[3s] ${isPlaying ? "scale-110" : "scale-100"}`}
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-900 to-accent-900">
                  <svg className="h-5 w-5 text-white/30" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" /></svg>
                </div>
              )}
              {isPlaying && (
                <div className="absolute inset-0 flex items-end justify-center gap-[3px] bg-black/25 pb-1.5">
                  {[1, 2, 3].map((b) => (
                    <span
                      key={b}
                      className="w-[3px] rounded-full bg-accent-400"
                      style={{
                        height: `${20 + b * 10}%`,
                        animation: `equalize 0.${5 + b}s ease-in-out infinite alternate`,
                        animationDelay: `${b * 0.08}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white group-hover:text-accent-300 transition">
                {currentSong.title}
              </p>
              <p className="truncate text-xs text-white/45">{currentSong.artist}</p>
            </div>
          </Link>

          {/* Time — left of controls on desktop */}
          <span className="hidden text-[11px] font-mono text-white/30 tabular-nums sm:block shrink-0">
            {fmt(currentTime)}
          </span>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Prev */}
            <button
              type="button"
              onClick={skipPrev}
              aria-label="Previous song"
              className="p-2 text-white/45 hover:text-white transition"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            {/* Play / Pause — larger, more prominent */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={`flex h-11 w-11 items-center justify-center rounded-full text-white transition-all shadow-lg ${
                isPlaying
                  ? "bg-accent-500 shadow-accent-500/30 hover:bg-accent-400"
                  : "bg-brand-500 shadow-brand-500/25 hover:bg-brand-400"
              }`}
            >
              {isLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : isPlaying ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              type="button"
              onClick={skipNext}
              disabled={queue.length === 0}
              aria-label="Next song"
              className="p-2 text-white/45 hover:text-white transition disabled:opacity-25"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1z" /><path d="M16 6h2v12h-2z" />
              </svg>
            </button>
          </div>

          {/* Time — right of controls */}
          <span className="hidden text-[11px] font-mono text-white/30 tabular-nums sm:block shrink-0">
            {fmt(duration)}
          </span>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {/* Volume — inline slider on desktop */}
            <div className="relative hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowVolume((v) => !v)}
                className="p-1.5 text-white/40 hover:text-white transition"
                aria-label="Volume"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  {volume === 0 ? (
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
                  ) : volume < 0.5 ? (
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                  ) : (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  )}
                </svg>
              </button>
              {showVolume && (
                <div className="absolute bottom-10 right-0 flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-[#111118]/95 p-3 shadow-xl backdrop-blur-xl">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="h-20 cursor-pointer appearance-none rounded-full volume-slider-vertical"
                    aria-label="Volume"
                  />
                  <span className="text-[10px] text-white/40">{Math.round(volume * 100)}%</span>
                </div>
              )}
            </div>

            {/* Queue */}
            <button
              type="button"
              onClick={() => setShowQueue((v) => !v)}
              className={`relative p-1.5 transition ${showQueue ? "text-accent-400" : "text-white/40 hover:text-white"}`}
              aria-label="Queue"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
              {queue.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent-500 text-[8px] font-black text-white">
                  {queue.length > 9 ? "9+" : queue.length}
                </span>
              )}
            </button>

            {/* Expand to fullscreen Now Playing */}
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="p-1.5 text-white/40 transition hover:text-white"
              aria-label="Open full player"
              title="Expand"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {fullscreen && <NowPlayingFullscreen onClose={() => setFullscreen(false)} />}

      <style>{`
        @keyframes equalize {
          from { transform: scaleY(0.3); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </>
  );
}
