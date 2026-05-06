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
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [showVolume, setShowVolume] = useState(false);

  useEffect(() => {
    // Assign the ref BEFORE attaching listeners so a fast unmount during
    // listener-attachment can't leave a dangling Audio without our cleanup.
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "metadata";
    try {
      audio.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
      audio.setAttribute("disablePictureInPicture", "true");
    } catch {
      /* older browsers — non-fatal */
    }

    const onLoadedMeta = () => setDuration(audio.duration);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onError = () => {
      // MediaError codes: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED
      const code = audio.error?.code;
      const msg =
        code === 2 ? "Network error — couldn't reach the audio."
        : code === 3 ? "Audio file is corrupted or unsupported."
        : code === 4 ? "This audio format isn't supported in your browser."
        : "Preview unavailable.";
      setError(msg);
      setLoading(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);

    audio.src = audioUrl;

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
      audio.src = "";
    };
  }, [audioUrl]);

  // Reset error state when a fresh src is requested.
  useEffect(() => {
    setError(null);
  }, [audioUrl]);

  // MediaSession — lock-screen / notification-shade controls for mobile.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "Epic Music Space",
      artwork: [],
    });

    const seek = (offset: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + offset));
    };

    navigator.mediaSession.setActionHandler("play", () => {
      void audioRef.current?.play().then(() => setPlaying(true));
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      setPlaying(false);
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => seek(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => seek(10));
    navigator.mediaSession.setActionHandler("stop", () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    });

    return () => {
      for (const action of ["play", "pause", "seekbackward", "seekforward", "stop"] as const) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch { /* unsupported */ }
      }
    };
  }, [title]);

  // Sync playback state with MediaSession so the OS shows the right icon.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  // Sync seek position with MediaSession so the OS scrubber is accurate.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: currentTime,
      });
    } catch { /* older browsers */ }
  }, [currentTime, duration]);

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
          setError("Couldn't start playback. Click again to retry.");
        });
    }
  }

  function handleProgressChange(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const nextProgress = Number(e.target.value);
    const nextTime = (nextProgress / 100) * audio.duration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    setProgress(nextProgress);
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

  function handleVolumeChange(v: number) {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
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
        <div className="rounded-xl border border-red-400/20 bg-black px-5 py-8 text-center text-sm text-red-300/80 shadow-inner" role="alert">
          {error}
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
              <div className="relative h-12 w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(progress)}
                  onChange={handleProgressChange}
                  aria-label={`Seek position in ${title}`}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.08)_0_2px,transparent_2px_10px)]" />
                <progress
                  max={100}
                  value={Math.round(progress)}
                  className="ems-progress ems-progress-wave absolute inset-y-2 left-0 right-0 h-8 w-full"
                  aria-hidden="true"
                />
                <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10" />
              </div>
              <div className="flex justify-between text-xs font-semibold text-white/35">
                <span>{fmt(currentTime)}</span>
                <span>{fmt(duration)}</span>
              </div>
            </div>
          </div>

          <div className="relative mt-5 flex items-center justify-between gap-2">
            <div className="flex gap-2">
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

            {/* Volume control */}
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowVolume((v) => !v)}
                aria-label="Volume"
                className="rounded-lg border border-white/10 bg-black/35 p-1.5 text-white/55 transition hover:border-white/25 hover:text-white"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  {volume === 0 ? (
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
                  ) : (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  )}
                </svg>
              </button>
              {showVolume && (
                <div className="absolute bottom-8 right-0 z-10 flex items-center gap-2 rounded-xl border border-white/15 bg-[#111118] px-3 py-2 shadow-xl">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="w-20 cursor-pointer accent-brand-500"
                    aria-label="Volume"
                  />
                  <span className="w-7 text-right text-[10px] text-white/40">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TV stand / wall mount */}
      <div className="mx-auto h-4 w-24 rounded-b-2xl bg-gradient-to-b from-zinc-700 to-zinc-950 shadow-lg shadow-black/50" />
      <div className="mx-auto h-1.5 w-36 rounded-full bg-black/70" />
    </div>
  );
}
