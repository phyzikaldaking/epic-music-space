"use client";

import { useState, useRef, useEffect } from "react";

interface AudioPlayerProps {
  audioUrl: string;
  title: string;
}

export default function AudioPlayer({ audioUrl, title }: AudioPlayerProps) {
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
      <div className="glass rounded-lg p-4 text-center text-sm text-red-400/70">
        Preview unavailable
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/35">
            Preview
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-white/76">
            {title}
          </p>
        </div>
        <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-white/45">
          {fmt(duration)}
        </span>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4">
        {/* Play / Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play preview"}
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full transition glow-purple-sm ${
            playing
              ? "bg-accent-500 hover:bg-accent-600"
              : "bg-brand-500 hover:bg-brand-600"
          }`}
        >
          {loading ? (
            <span className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
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

        {/* Waveform / seek bar */}
        <div className="flex flex-1 flex-col gap-1.5">
          <div
            className="relative h-2 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
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
            {/* Buffered / background */}
            <div className="absolute inset-0 rounded-full bg-white/8" />
            {/* Played progress */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/35">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => seekBy(-10)}
          aria-label={`Skip back 10 seconds in ${title}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/55 transition hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          -10s
        </button>
        <button
          type="button"
          onClick={() => seekBy(10)}
          aria-label={`Skip forward 10 seconds in ${title}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/55 transition hover:border-white/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          +10s
        </button>
      </div>
    </div>
  );
}
