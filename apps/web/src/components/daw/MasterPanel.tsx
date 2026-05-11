"use client";

import { useEffect, useRef, useState } from "react";
import {
  MASTERING_PRESET_ORDER,
  getMasteringPreset,
  type EqBand,
  type MasteringPresetId,
} from "./dawEngine";
import { LufsMeter } from "../LufsMeter";
import MixDiagnosticsCallout from "./MixDiagnosticsCallout";

interface Props {
  /** Read-only state straight from the engine snapshot. */
  spectrum: number[];
  lufs: number;
  truePeak: number;
  /** Stereo phase correlation -1 (out of phase) .. +1 (mono). Drives a
   *  small correlation needle on the master panel. */
  phaseCorrelation?: number;
  /** Master EQ values. */
  eqLowDb: number;
  eqMidDb: number;
  eqHighDb: number;
  onSetEq: (band: EqBand, db: number) => void;
  /** Mid-Side EQ mode toggle (#9). When on, eq[Low/Mid/High]Db shape
   *  the *mid* bus and sideEq[Low/Mid/High]Db shape the *side*. */
  midSideMode?: boolean;
  onSetMidSideMode?: (on: boolean) => void;
  sideEqLowDb?: number;
  sideEqMidDb?: number;
  sideEqHighDb?: number;
  onSetSideEq?: (band: EqBand, db: number) => void;
  /** Apply a one-click mastering chain preset (EQ + limiter + gain). */
  onApplyMasteringPreset: (preset: MasteringPresetId) => void;
  /** Master tape saturation drive 0..1 (#15). */
  tapeDrive?: number;
  onSetTapeDrive?: (drive: number) => void;
  /** Multiband comp (#13). */
  multibandEnabled?: boolean;
  multibandCrossoverHz?: number;
  multibandLowThreshDb?: number;
  multibandLowRatio?: number;
  multibandHighThreshDb?: number;
  multibandHighRatio?: number;
  onSetMultibandEnabled?: (on: boolean) => void;
  onSetMultibandCrossover?: (hz: number) => void;
  onSetMultibandLow?: (params: { threshDb?: number; ratio?: number }) => void;
  onSetMultibandHigh?: (params: { threshDb?: number; ratio?: number }) => void;
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
  phaseCorrelation,
  eqLowDb,
  eqMidDb,
  eqHighDb,
  onSetEq,
  onApplyMasteringPreset,
  midSideMode = false,
  onSetMidSideMode,
  sideEqLowDb = 0,
  sideEqMidDb = 0,
  sideEqHighDb = 0,
  onSetSideEq,
  tapeDrive,
  onSetTapeDrive,
  multibandEnabled = false,
  multibandCrossoverHz = 200,
  multibandLowThreshDb = -18,
  multibandLowRatio = 3,
  multibandHighThreshDb = -18,
  multibandHighRatio = 2,
  onSetMultibandEnabled,
  onSetMultibandCrossover,
  onSetMultibandLow,
  onSetMultibandHigh,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Throttle spectrum repaints to ~15Hz. The engine updates the
  // spectrum array at engine-tick rate (≈60Hz), but the visual diff
  // between consecutive 16ms frames is imperceptible. Skipping ~75% of
  // repaints cuts canvas draw cost dramatically with no visible
  // quality loss. Force-paint when the canvas first attaches by
  // initializing lastPaintRef to 0.
  const lastPaintRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    if (now - lastPaintRef.current < 67) {
      // Less than one 15Hz frame since the previous paint — skip.
      return;
    }
    lastPaintRef.current = now;
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

      <LufsMeter lufs={lufs} />

      {/* One-click mastering chain presets — sets EQ + limiter + gain
          to a delivery-target config. Users can still tweak afterwards. */}
      <div className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/85">
            One-click master
          </span>
          {MASTERING_PRESET_ORDER.map((id) => {
            const cfg = getMasteringPreset(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onApplyMasteringPreset(id)}
                title={cfg.description}
                className="rounded-md border border-emerald-400/30 bg-black/30 px-2 py-1 text-[11px] font-bold text-emerald-100 hover:bg-emerald-400/15 hover:text-emerald-50 transition"
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <MatchReferenceRow onSetEq={onSetEq} />

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

        {/* Master EQ. M/S mode (#9) splits the EQ into Mid + Side
            chains; in stereo mode the side panel is hidden so casual
            users see the familiar 3-knob layout. */}
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 p-3 sm:w-[260px]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
              {midSideMode ? "Mid EQ" : "Master EQ"}
            </p>
            {onSetMidSideMode && (
              <button
                type="button"
                onClick={() => onSetMidSideMode(!midSideMode)}
                className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest transition ${
                  midSideMode
                    ? "bg-cyan-400 text-black"
                    : "border border-white/15 text-white/55 hover:bg-white/10"
                }`}
                title={
                  midSideMode
                    ? "M/S mode on — side panel shapes the stereo image separately"
                    : "Stereo mode (single L+R EQ). Click for Mid-Side."
                }
              >
                M/S
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <EqKnob label="Low" db={eqLowDb} onChange={(v) => onSetEq("low", v)} />
            <EqKnob label="Mid" db={eqMidDb} onChange={(v) => onSetEq("mid", v)} />
            <EqKnob label="High" db={eqHighDb} onChange={(v) => onSetEq("high", v)} />
          </div>
        </div>
        {midSideMode && onSetSideEq && (
          <div className="flex flex-col gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/[0.04] p-3 sm:w-[260px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-200">
              Side EQ
            </p>
            <div className="grid grid-cols-3 gap-3">
              <EqKnob label="Low" db={sideEqLowDb} onChange={(v) => onSetSideEq("low", v)} />
              <EqKnob label="Mid" db={sideEqMidDb} onChange={(v) => onSetSideEq("mid", v)} />
              <EqKnob label="High" db={sideEqHighDb} onChange={(v) => onSetSideEq("high", v)} />
            </div>
            <p className="text-[9px] text-white/45">
              Boost side highs to widen; cut side lows to tighten bass.
            </p>
          </div>
        )}

        {/* Master tape saturation (#15) — sits between EQ and limiter.
            Subtle 0..0.3 = mix glue; 0.3..0.7 = analog warmth; >0.7 =
            obvious color. Bit-perfect bypass at 0. */}
        {onSetTapeDrive && (
          <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/30 p-3 sm:w-[120px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
              Tape
            </p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={tapeDrive ?? 0}
              onChange={(e) => onSetTapeDrive(Number(e.target.value))}
              aria-label="Master tape saturation drive"
              title={`Tape drive — 0 is bypass, >0.7 is obvious color (currently ${Math.round((tapeDrive ?? 0) * 100)}%)`}
              className="accent-amber-400"
            />
            <p className="text-center font-mono text-[10px] tabular-nums text-white/70">
              {Math.round((tapeDrive ?? 0) * 100)}%
            </p>
          </div>
        )}
      </div>

      {typeof phaseCorrelation === "number" && (
        <PhaseCorrelationMeter correlation={phaseCorrelation} />
      )}

      {onSetMultibandEnabled && (
        <MultibandPanel
          enabled={multibandEnabled}
          crossoverHz={multibandCrossoverHz}
          lowThreshDb={multibandLowThreshDb}
          lowRatio={multibandLowRatio}
          highThreshDb={multibandHighThreshDb}
          highRatio={multibandHighRatio}
          onSetEnabled={onSetMultibandEnabled}
          onSetCrossover={onSetMultibandCrossover}
          onSetLow={onSetMultibandLow}
          onSetHigh={onSetMultibandHigh}
        />
      )}

      <MixDiagnosticsCallout spectrum={spectrum} lufs={lufs} truePeak={truePeak} />
    </section>
  );
}

// Master multiband compressor controls (#13). Two compressors with a
// shared crossover. Lives inside MasterPanel because it's part of the
// master chain, but is collapsible so it doesn't clutter the panel for
// producers who don't need it.
function MultibandPanel({
  enabled,
  crossoverHz,
  lowThreshDb,
  lowRatio,
  highThreshDb,
  highRatio,
  onSetEnabled,
  onSetCrossover,
  onSetLow,
  onSetHigh,
}: {
  enabled: boolean;
  crossoverHz: number;
  lowThreshDb: number;
  lowRatio: number;
  highThreshDb: number;
  highRatio: number;
  onSetEnabled: (on: boolean) => void;
  onSetCrossover?: (hz: number) => void;
  onSetLow?: (params: { threshDb?: number; ratio?: number }) => void;
  onSetHigh?: (params: { threshDb?: number; ratio?: number }) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300/85">
            Multiband
          </p>
          <p className="mt-0.5 text-[11px] text-white/55">
            Compress low + high bands independently. Tames boomy 808s
            without flattening the snare.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSetEnabled(!enabled)}
          className={`rounded-md px-3 py-1 text-[11px] font-black uppercase tracking-widest transition ${
            enabled
              ? "bg-cyan-400 text-black"
              : "border border-white/15 text-white/55 hover:bg-white/10"
          }`}
          aria-label={`Master multiband compressor ${enabled ? "on" : "off"}`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {enabled && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MultibandKnobs
            label={`Low <${crossoverHz}Hz`}
            threshDb={lowThreshDb}
            ratio={lowRatio}
            onChange={(p) => onSetLow?.(p)}
          />
          <MultibandKnobs
            label={`High ≥${crossoverHz}Hz`}
            threshDb={highThreshDb}
            ratio={highRatio}
            onChange={(p) => onSetHigh?.(p)}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/55">
              Crossover
            </p>
            <input
              type="range"
              min={80}
              max={600}
              step={10}
              value={crossoverHz}
              onChange={(e) => onSetCrossover?.(Number(e.target.value))}
              aria-label="Multiband crossover frequency"
              className="accent-cyan-400"
            />
            <p className="font-mono text-[10px] tabular-nums text-white/70">
              {crossoverHz} Hz
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MultibandKnobs({
  label,
  threshDb,
  ratio,
  onChange,
}: {
  label: string;
  threshDb: number;
  ratio: number;
  onChange: (params: { threshDb?: number; ratio?: number }) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-white/10 bg-black/20 p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/55">
        {label}
      </p>
      <label className="text-[9px] uppercase tracking-widest text-white/45">
        Thresh
        <input
          type="range"
          min={-60}
          max={0}
          step={0.5}
          value={threshDb}
          onChange={(e) => onChange({ threshDb: Number(e.target.value) })}
          className="w-full accent-cyan-400"
          aria-label={`${label} threshold`}
        />
      </label>
      <p className="-mt-1 font-mono text-[10px] tabular-nums text-white/70">
        {threshDb.toFixed(1)} dB
      </p>
      <label className="text-[9px] uppercase tracking-widest text-white/45">
        Ratio
        <input
          type="range"
          min={1}
          max={20}
          step={0.5}
          value={ratio}
          onChange={(e) => onChange({ ratio: Number(e.target.value) })}
          className="w-full accent-cyan-400"
          aria-label={`${label} ratio`}
        />
      </label>
      <p className="-mt-1 font-mono text-[10px] tabular-nums text-white/70">
        {ratio.toFixed(1)}:1
      </p>
    </div>
  );
}

// -1..+1 phase correlation needle (#12). +1 = mono-coherent, 0 = wide
// stereo, -1 = anti-phase (mono kills the signal). The needle is a
// thin vertical bar over a colored gradient: red on the left (danger),
// amber middle, green right (safe). Producers glance at this before
// publishing to catch a stereo widener gone wrong.
function PhaseCorrelationMeter({ correlation }: { correlation: number }) {
  const clamped = Math.max(-1, Math.min(1, correlation));
  // Map -1..+1 to 0..100% along the bar.
  const leftPct = ((clamped + 1) / 2) * 100;
  // Risk band — red below 0 (anti-phase territory), amber 0..0.5,
  // green above. Drives the badge color so the meter reads "good /
  // watch / problem" at a glance.
  const tone =
    clamped < 0
      ? { label: "Anti-phase", color: "text-rose-200", bg: "bg-rose-500/15" }
      : clamped < 0.5
        ? { label: "Wide", color: "text-amber-200", bg: "bg-amber-500/15" }
        : { label: "Mono-safe", color: "text-emerald-200", bg: "bg-emerald-500/15" };
  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-white/55">
        <span>Stereo correlation</span>
        <span
          className={`rounded-full px-1.5 py-0.5 ${tone.bg} ${tone.color} font-black`}
        >
          {clamped.toFixed(2)} · {tone.label}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full border border-white/10">
        {/* Three-zone background. Red ←  middle → green. */}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/60 via-amber-400/55 to-emerald-500/60" />
        {/* Center tick at 0 (wide stereo). */}
        <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
        {/* Live needle. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.7)]"
          style={{ left: `calc(${leftPct}% - 1px)` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-white/45">
        +1 = mono-safe · 0 = wide stereo · &lt; 0 = phase cancellation on mono playback
      </p>
    </div>
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

/** "Match a reference" (#11). User picks a song they want their mix to
 *  resemble; we run a client-side FFT analysis and apply the resulting
 *  EQ deltas to the master EQ. Gentle by design (±6 dB clamp) — gives
 *  the user a starting point, not a finished master. */
function MatchReferenceRow({
  onSetEq,
}: {
  onSetEq: (band: EqBand, db: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const Ctor =
        typeof window !== "undefined"
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext
          : null;
      if (!Ctor) {
        setMessage("AudioContext unavailable in this browser.");
        return;
      }
      const ctx = new Ctor();
      // Run analysis off the main thread so the UI stays responsive
      // while the 16K FFT crunches (#14). Falls back to sync analysis
      // in SSR/no-Worker environments.
      const { analyseReferenceAsync } = await import("@/lib/matchering");
      const result = await analyseReferenceAsync(ctx, file);
      void ctx.close();
      if (!result) {
        setMessage("Couldn't decode the reference. Try a WAV or MP3.");
        return;
      }
      onSetEq("low", result.eq.low);
      onSetEq("mid", result.eq.mid);
      onSetEq("high", result.eq.high);
      setMessage(
        `Applied: low ${fmt(result.eq.low)}, mid ${fmt(result.eq.mid)}, high ${fmt(result.eq.high)} dB.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Match failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-tube-300/25 bg-tube-300/[0.04] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-tube-300">
          Match a reference
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md border border-tube-300/35 bg-black/30 px-2 py-1 text-[11px] font-bold text-tube-100 hover:bg-tube-300/15 transition disabled:opacity-50"
        >
          {busy ? "Analysing…" : "Pick a song you want to sound like"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aif,.aiff,.flac,.ogg"
          aria-label="Reference song"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.currentTarget.value = "";
          }}
        />
      </div>
      {message && <p className="mt-1 text-[11px] text-white/65">{message}</p>}
    </div>
  );
}

function fmt(db: number): string {
  return db >= 0 ? `+${db.toFixed(1)}` : db.toFixed(1);
}
