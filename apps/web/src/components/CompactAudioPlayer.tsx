"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  label?: string;
  className?: string;
  /** Optional id placed on the inner <audio> for callers that need to seek
   * via document.getElementById (e.g. A/B compare cue points). */
  audioId?: string;
}

/**
 * Minimal custom audio player. NEVER renders the native HTML5 controls (which
 * include a download button in Chrome's overflow menu). Designed to replace
 * any place we previously wrote `<audio controls>`.
 *
 * Hardening applied to the underlying <audio>:
 *   - controlsList="nodownload nofullscreen noremoteplayback"
 *   - disablePictureInPicture
 *   - onContextMenu prevented (no right-click "Save audio as")
 *
 * None of this stops a determined attacker (the audio bytes still flow over
 * the wire), but every casual user-visible download path is closed.
 */
export default function CompactAudioPlayer({ src, label, className, audioId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  function fmt(s: number) {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2 ${className ?? ""}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <audio
        ref={audioRef}
        id={audioId}
        src={src}
        preload="metadata"
        controlsList="nodownload nofullscreen noremoteplayback"
        // @ts-expect-error — disablePictureInPicture is a valid HTML attr but not in React types yet
        disablePictureInPicture
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : `Play${label ? ` ${label}` : ""}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25"
      >
        {playing ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex flex-1 items-center gap-3">
        {label && <span className="truncate text-xs font-semibold text-white/65">{label}</span>}
        <div
          className="relative h-2 flex-1 cursor-pointer rounded-full bg-white/10"
          onClick={seek}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0 as number}
          aria-valuemax={100 as number}
          aria-valuenow={Math.round(progress) as number}
          aria-valuetext={`${Math.round(progress)}%`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-400 transition-all dyn-w"
            style={{ "--dyn-w": `${progress}%` } as React.CSSProperties}
          />
        </div>
        <span className="hidden tabular-nums text-[10px] text-white/40 sm:inline">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>
    </div>
  );
}
