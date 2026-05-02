"use client";

import { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
  songId?: string;
}

export default function AudioPlayer({ audioUrl, title, songId }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.preload = "metadata";

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audio.currentTime = 0;
    });

    audio.addEventListener("waiting", () => setLoading(true));
    audio.addEventListener("canplay", () => setLoading(false));
    audio.addEventListener("error", () => {
      setError(true);
      setLoading(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || error) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      void audio
        .play()
        .then(() => {
          setPlaying(true);
          setLoading(false);
          if (songId) {
            void fetch(`/api/songs/${songId}/stream`, { method: "POST" });
          }
        })
        .catch(() => {
          setPlaying(false);
          setLoading(false);
          setError(true);
        });
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
    setProgress(ratio * 100);
  }

  function seekBy(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;

    const durationLimit = Number.isFinite(audio.duration)
      ? audio.duration
      : audio.currentTime + seconds;
    const nextTime = Math.max(0, Math.min(durationLimit, audio.currentTime + seconds));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    if (audio.duration) {
      setProgress((nextTime / audio.duration) * 100);
    }
  }

  function fmt(s: number) {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (error) {
    return (
      <div className="relative rounded-2xl bg-[#05070d] p-2 shadow-2xl shadow-black/40 ring-1 ring-white/10">
        <div className="rounded-xl border border-red-400/20 bg-black px-5 py-8 text-center text-sm text-red-300/80 shadow-inner">
          Preview unavailable
        </div>
        <div className="mx-auto h-3 w-20 rounded-b-xl bg-white/10" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-xl">
      <div className="absolute -inset-1 rounded-[1.6rem] bg-gradient-to-br from-white/20 via-brand-500/15 to-accent-500/20 blur-xl" />

      {/* Wall-mounted flat-screen frame */}
      <div className="relative rounded-[1.55rem] border border-white/15 bg-gradient-to-b from-zinc-800 via-[#11131b] to-black p-2 shadow-2xl shadow-black/60">
        <div className="pointer-events-none absolute inset-x-8 top-1 h-px bg-white/35" />
        <div className="relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.16),transparent_32%),linear-gradient(135deg,rgba(12,16,28,0.96),rgba(0,0,0,0.98))] p-5 shadow-inner shadow-black/80">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.16),transparent_22%,transparent_70%,rgba(255,255,255,0.05))]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="pointer-events-none absolute bottom-3 left-5 right-5 h-px bg-gradient-to-r from-transparent via-accent-400/40 to-transparent" />

          <div className="relative mb-5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${playing ? "bg-accent-400 shadow-[0_0_12px_rgba(45,212,191,0.9)]" : "bg-white/25"}`} />
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/35">
                  EMS Wall Screen Preview
                </p>
              </div>
              <p className="truncate text-sm font-bold text-white/85">
                {title}
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs font-semibold text-white/55">
              {fmt(duration)}
            </span>
          </div>

          {/* Controls row */}
          <div className="relative flex items-center gap-4">
            {/* Play / Pause button */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play preview"}
              className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-white/15 transition shadow-lg ${
                playing
                  ? "bg-accent-500 shadow-accent-500/30 hover:bg-accent-600"
                  : "bg-brand-500 shadow-brand-500/30 hover:bg-brand-600"
              }`}
            >
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : playing ? (
                /* Pause icon */
                <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                /* Play icon */
                <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Screen-style waveform / seek bar */}
            <div className="flex flex-1 flex-col gap-2">
              <div
                className="relative h-12 w-full cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/50"
                onClick={handleSeek}
                role="slider"
                aria-label={`Seek position in ${title}`}
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${fmt(currentTime)} of ${fmt(duration)}`}
                tabIndex={0}
                onKeyDown={(e) => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  if (e.key === "ArrowRight") seekBy(5);
                  if (e.key === "ArrowLeft") seekBy(-5);
                }}
              >
                <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.08)_0_2px,transparent_2px_10px)]" />
                <div className="absolute inset-y-2 left-0 rounded-r-xl bg-gradient-to-r from-brand-500/80 to-accent-400/80 transition-all" style={{ width: `${progress}%` }} />
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
              </div>
              <div className="flex justify-between text-xs font-semibold text-white/35">
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => seekBy(-10)}
              aria-label={`Skip back 10 seconds in ${title}`}
              className="rounded-lg border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white/55 transition hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              -10s
            </button>
            <button
              type="button"
              onClick={() => seekBy(10)}
              aria-label={`Skip forward 10 seconds in ${title}`}
              className="rounded-lg border border-white/10 bg-black/35 px-3 py-1.5 text-xs font-semibold text-white/55 transition hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              +10s
            </button>
          </div>
        </div>
      </div>

      {/* TV stand / wall mount */}
      <div className="mx-auto h-4 w-24 rounded-b-2xl bg-gradient-to-b from-zinc-700 to-zinc-950 shadow-lg shadow-black/50" />
      <div className="mx-auto h-1.5 w-36 rounded-full bg-black/70" />
    </div>
  );
}
