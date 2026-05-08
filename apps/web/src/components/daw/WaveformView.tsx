"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Pre-computed peak amplitudes 0..1 — output of engine.getWaveformPeaks(). */
  peaks: number[];
  /** Track accent color so each waveform reads as belonging to its strip. */
  color: string;
  /** Optional progress 0..1 for a played-portion highlight. */
  progress?: number;
  /** Total length of the audio in seconds. Required when onScrub is set
   *  so click positions can be translated into engine seek targets. */
  durationSec?: number;
  /** Click + drag the waveform to scrub the playhead, like Pro Tools.
   *  Receives a position in seconds. Caller wires this to engine.seek().
   *  Omit to keep the waveform display-only. */
  onScrub?: (positionSec: number) => void;
  className?: string;
}

function leftPercentClass(value: number) {
  const snapped = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  return `u-left-pct-${snapped}`;
}

/**
 * Lightweight waveform renderer. Canvas (not SVG) so 200+ bars don't
 * make the React tree heavy, and so we can repaint cheaply when only
 * the progress overlay changes.
 *
 * Bulletproofing: if peaks is empty we render nothing — no error, no
 * placeholder noise. A track without audio just shows the strip's
 * "Empty" state. We pin DPR at 1.5 for retina sharpness without paying
 * the full pixel cost on dense screens.
 */
export default function WaveformView({
  peaks,
  color,
  progress = 0,
  durationSec,
  onScrub,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const scrubbable = typeof onScrub === "function" && (durationSec ?? 0) > 0;

  const positionFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap || !durationSec) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * durationSec;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 1.5);
    const cssWidth = parent.clientWidth;
    const cssHeight = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!peaks.length) return;

    const mid = cssHeight / 2;
    const barWidth = cssWidth / peaks.length;
    const playedX = cssWidth * Math.max(0, Math.min(1, progress));

    for (let i = 0; i < peaks.length; i++) {
      const peak = Math.max(0.02, peaks[i] ?? 0);
      const h = peak * (cssHeight - 2);
      const x = i * barWidth;
      const playedHere = x < playedX;
      ctx.fillStyle = playedHere ? color : `${color}66`; // hex+alpha
      ctx.fillRect(x, mid - h / 2, Math.max(1, barWidth - 0.5), h);
    }
  }, [peaks, color, progress]);

  if (peaks.length === 0) return null;

  const playheadPct = `${Math.max(0, Math.min(100, progress * 100))}%`;

  return (
    <div
      ref={wrapRef}
      className={`relative h-10 w-full overflow-hidden rounded-md bg-black/30 ${
        scrubbable ? "cursor-col-resize select-none" : ""
      } ${className}`}
      aria-label={scrubbable ? "Scrub playhead" : undefined}
      onPointerDown={(e) => {
        if (!scrubbable) return;
        const sec = positionFromEvent(e);
        if (sec == null) return;
        draggingRef.current = true;
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {
          // setPointerCapture can throw if the pointer is gone — safe to ignore.
        }
        onScrub?.(sec);
      }}
      onPointerMove={(e) => {
        if (!scrubbable || !draggingRef.current) return;
        const sec = positionFromEvent(e);
        if (sec == null) return;
        onScrub?.(sec);
      }}
      onPointerUp={(e) => {
        if (!scrubbable) return;
        draggingRef.current = false;
        try {
          (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
        } catch {
          // Pointer already released.
        }
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {scrubbable && (
        <span
          aria-hidden
          className={`pointer-events-none absolute bottom-0 top-0 w-px bg-white/85 shadow-[0_0_6px_rgba(255,255,255,0.6)] ${leftPercentClass(progress * 100)}`}
        />
      )}
    </div>
  );
}
