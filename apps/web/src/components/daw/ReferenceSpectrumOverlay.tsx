"use client";

import { useEffect, useRef } from "react";
import type { DawEngine } from "./dawEngine";

// Live spectrum comparison: user mix (cyan) overlaid with the loaded
// reference track (amber). Producers use this to see where their mix
// is shy or bloated relative to a commercial track — e.g. "the
// reference has way more 80 Hz than my mix" tells you to push the
// kick or the 808 lower.
//
// We sample both at ~30 fps via requestAnimationFrame. Both come back
// as 32-bin arrays scaled 0..1 so the painter just plots them.

type Props = {
  engine: DawEngine;
  /** Live mix spectrum, refreshed on every engine snapshot. */
  masterSpectrum: number[];
  height?: number;
};

const BANDS = 32;
// Approximate band labels — Hz centers given a 24 kHz Nyquist and
// 32 linear bins. Producers think in named bands, so we annotate the
// rough zones (sub, bass, low-mid, mid, hi-mid, presence, air).
const BAND_LABELS = ["sub", "bass", "low-mid", "mid", "hi-mid", "presence", "air"];

export default function ReferenceSpectrumOverlay({
  engine,
  masterSpectrum,
  height = 100,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function paint() {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      // Mid-tone gridline so the eye locks in on relative levels.
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += h / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const reference = engine.getReferenceSpectrum();
      const barWidth = w / BANDS;
      // Mix in cyan, reference in amber. Reference draws first so
      // the mix overlay ends up visually "on top" — producers most
      // often want to read their own mix at a glance.
      for (let i = 0; i < BANDS; i++) {
        const refVal = Math.max(0, Math.min(1, reference[i] ?? 0));
        const refH = refVal * (h - 2);
        ctx.fillStyle = "rgba(245,158,11,0.5)";
        ctx.fillRect(
          i * barWidth + 1,
          h - refH,
          Math.max(0.5, barWidth - 1),
          refH,
        );
      }
      for (let i = 0; i < BANDS; i++) {
        const mixVal = Math.max(0, Math.min(1, masterSpectrum[i] ?? 0));
        const mixH = mixVal * (h - 2);
        ctx.fillStyle = "rgba(34,211,238,0.75)";
        ctx.fillRect(
          i * barWidth + 1,
          h - mixH,
          Math.max(0.5, barWidth - 3),
          mixH,
        );
      }
      rafRef.current = requestAnimationFrame(paint);
    }

    rafRef.current = requestAnimationFrame(paint);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [engine, masterSpectrum]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
          Spectrum · mix vs reference
        </span>
        <div className="flex items-center gap-3 text-[9px] uppercase tracking-widest">
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-cyan-400" /> Mix
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Ref
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={480}
        height={height}
        className="block w-full"
        style={{ height }}
      />
      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-white/35">
        {BAND_LABELS.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </div>
  );
}
