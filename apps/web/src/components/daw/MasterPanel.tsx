"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Read-only state straight from the engine snapshot. */
  spectrum: number[];
  lufs: number;
  truePeak: number;
  /** Master EQ values. */
  eqLowDb: number;
  eqMidDb: number;
  eqHighDb: number;
  onSetEq: (band: "low" | "mid" | "high", db: number) => void;
  /** Reference track for mastering A/B. */
  referenceEnabled: boolean;
  referenceLevel: number;
  onSetReferenceEnabled: (enabled: boolean) => void;
  onSetReferenceLevel: (level: number) => void;
  onLoadReference: (file: Blob) => void;
}

/**
 * Pro-grade mastering panel.
 *
 *   • Master EQ — three biquads matching track EQ shape, so the user
 *     thinks in the same units everywhere.
 *   • Real-time spectrum analyzer — log-frequency bars driven by the
 *     engine's master analyser.
 *   • LUFS readout — short-term K-weighted loudness. Color-codes the
 *     reading against streaming targets (-14 LUFS Spotify/Apple).
 *   • True peak — instantaneous max amplitude, in dBFS. Anything > -1
 *     dBFS is the limit you don't want to cross before lossy encoders.
 *
 * Render strategy: spectrum on a canvas (32 bars, repaints each rAF
 * driven by props change). Numbers update at the engine's tick rate.
 */
export default function MasterPanel({
  spectrum,
  lufs,
  truePeak,
  eqLowDb,
  eqMidDb,
  eqHighDb,
  onSetEq,
  referenceEnabled,
  referenceLevel,
  onSetReferenceEnabled,
  onSetReferenceLevel,
  onLoadReference,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 1.5);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const bars = spectrum.length;
    if (bars === 0) return;
    const barW = w / bars;

    for (let i = 0; i < bars; i++) {
      const v = spectrum[i] ?? 0;
      const barH = Math.max(1, v * (h - 2));
      // Spectrum gradient: cyan → violet → pink as you move up the spectrum.
      const hue = 200 - (i / bars) * 60; // 200..140
      ctx.fillStyle = `hsl(${hue}, 80%, ${30 + v * 40}%)`;
      ctx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
    }
  }, [spectrum]);

  const lufsDisplay = Number.isFinite(lufs) ? lufs.toFixed(1) : "—";
  // Color-code LUFS against -14 streaming target. Anything close is good.
  const lufsHue =
    !Number.isFinite(lufs)
      ? 200
      : lufs > -8
        ? 0 // crushing — too loud
        : lufs > -12
          ? 30 // hot but acceptable
          : lufs > -16
            ? 130 // sweet spot
            : 200; // quiet
  const truePeakDb =
    truePeak > 0 ? 20 * Math.log10(Math.max(0.0001, truePeak)) : -Infinity;
  const peakDisplay = Number.isFinite(truePeakDb) ? `${truePeakDb.toFixed(1)} dB` : "−∞";
  const peakClipping = Number.isFinite(truePeakDb) && truePeakDb > -1;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#0c0c14] via-[#0a0a12] to-[#0c0c14] p-4">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300/85">
            Master · Mastering
          </p>
          <p className="mt-0.5 text-xs text-white/55">
            EQ + spectrum + loudness. Streaming targets: Spotify / Apple ≈ -14 LUFS · YouTube ≈ -14 · TIDAL ≈ -14.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ReadoutCard
            label="LUFS"
            value={lufsDisplay}
            unit="short-term"
            hue={lufsHue}
            target="-14 streaming"
          />
          <ReadoutCard
            label="True peak"
            value={peakDisplay}
            unit="dBFS"
            hue={peakClipping ? 0 : truePeakDb > -3 ? 30 : 130}
            target={peakClipping ? "DUCK ‼" : "≤ -1 ok"}
          />
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-stretch">
        {/* Spectrum */}
        <div className="relative h-32 overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/5">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-2 text-[8px] font-mono uppercase tracking-widest text-white/30">
            <span>20 Hz</span>
            <span>200</span>
            <span>2k</span>
            <span>20k</span>
          </div>
        </div>

        {/* Master EQ */}
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-white/10 bg-black/30 p-3 sm:w-[260px]">
          <EqKnob label="Low" db={eqLowDb} onChange={(v) => onSetEq("low", v)} />
          <EqKnob label="Mid" db={eqMidDb} onChange={(v) => onSetEq("mid", v)} />
          <EqKnob label="High" db={eqHighDb} onChange={(v) => onSetEq("high", v)} />
        </div>
      </div>

      {/* Reference track for A/B mastering comparison */}
      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={referenceEnabled}
              onChange={(e) => onSetReferenceEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
              Reference Track
            </span>
          </label>
          <label className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 cursor-pointer transition">
            Upload
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLoadReference(file);
              }}
            />
          </label>
        </div>
        {referenceEnabled && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/45">Level:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={referenceLevel}
              onChange={(e) => onSetReferenceLevel(Number(e.target.value))}
              className="flex-1 accent-cyan-400"
            />
            <span className="text-[9px] font-mono text-white/65 w-10 text-right">
              {Math.round(referenceLevel * 100)}%
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ReadoutCard({
  label,
  value,
  unit,
  hue,
  target,
}: {
  label: string;
  value: string;
  unit: string;
  hue: number;
  target?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-right">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">{label}</p>
      <p
        className="font-mono text-2xl font-extrabold tabular-nums leading-none"
        style={{ color: `hsl(${hue}, 80%, 65%)` }}
      >
        {value}
      </p>
      <p className="mt-1 text-[9px] uppercase tracking-widest text-white/35">
        {unit}
        {target ? ` · ${target}` : ""}
      </p>
    </div>
  );
}

function EqKnob({
  label,
  db,
  onChange,
}: {
  label: string;
  db: number;
  onChange: (db: number) => void;
}) {
  return (
    <label className="flex flex-col items-stretch gap-1 text-center">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/45">{label}</span>
      <input
        type="range"
        min={-12}
        max={12}
        step={0.5}
        value={db}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-emerald-400"
      />
      <span className="font-mono text-[10px] tabular-nums text-white/65">
        {db > 0 ? `+${db.toFixed(1)}` : db.toFixed(1)} dB
      </span>
    </label>
  );
}
