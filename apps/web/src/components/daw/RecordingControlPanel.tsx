"use client";

import { useState } from "react";
import type { DawEngine } from "./dawEngine";

// Recording-day control center. Surfaces the tracking knobs producers
// reach for between takes: metronome subdivision / accent / swing,
// cue-mix level, talkback (push-to-talk), measured device latency,
// and quick links to the take browser + vocal warmup.
//
// Kept compact because the right-hand strip is already busy on small
// laptops; everything past the first row is behind a "More" toggle.

type Props = {
  engine: DawEngine;
  // Pulled out of the engine state at the call site so this component
  // re-renders when those values change without subscribing itself.
  metronomeOn: boolean;
  metronomeSubdivision: "1/4" | "1/8" | "1/16";
  metronomeAccentDownbeat: boolean;
  metronomeSwing: number;
  cueMixLevel: number;
  talkbackOn: boolean;
  measuredDeviceLatencyMs: number;
  onOpenTakeBrowser: () => void;
  onOpenWarmup: () => void;
};

export default function RecordingControlPanel({
  engine,
  metronomeOn,
  metronomeSubdivision,
  metronomeAccentDownbeat,
  metronomeSwing,
  cueMixLevel,
  talkbackOn,
  measuredDeviceLatencyMs,
  onOpenTakeBrowser,
  onOpenWarmup,
}: Props) {
  const [more, setMore] = useState(false);

  return (
    <section
      className="rounded-2xl border border-amber-500/25 bg-black/40 p-3 text-[11px]"
      data-studio-section="recording-controls"
    >
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
            Tracking
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/55">
            Recording day controls
          </span>
        </div>
        <button
          onClick={() => setMore((v) => !v)}
          className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70 hover:bg-white/10"
        >
          {more ? "Hide" : "More"}
        </button>
      </header>

      {/* ── Talkback + Cue mix (always visible — recording essentials) ── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onMouseDown={() => engine.setTalkback(true)}
          onMouseUp={() => engine.setTalkback(false)}
          onTouchStart={() => engine.setTalkback(true)}
          onTouchEnd={() => engine.setTalkback(false)}
          onMouseLeave={() => talkbackOn && engine.setTalkback(false)}
          className={`group relative overflow-hidden rounded-xl border px-3 py-3 text-left transition ${
            talkbackOn
              ? "border-red-400 bg-red-500/20 shadow-[0_0_24px_rgba(239,68,68,0.4)]"
              : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
          }`}
          title="Hold to talk through the performer's headphones"
        >
          <div className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">
            Talkback {talkbackOn ? "· LIVE" : ""}
          </div>
          <div className="mt-1 font-display text-base">
            {talkbackOn ? "🔴 On air" : "Hold to talk"}
          </div>
          <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/45">
            Push & hold
          </div>
        </button>

        <div className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">
              Cue mix
            </span>
            <span className="font-mono text-[10px] text-white/70">
              {(cueMixLevel * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={cueMixLevel}
            onChange={(e) => engine.setCueMixLevel(parseFloat(e.target.value))}
            className="mt-2 w-full accent-amber-400"
            aria-label="Cue mix level"
          />
          <div className="mt-0.5 text-[9px] uppercase tracking-widest text-white/45">
            Performer headphones
          </div>
        </div>
      </div>

      {/* ── Metronome row ───────────────────────────────────────────── */}
      <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">
            Click — {metronomeOn ? "ON" : "OFF"}
          </span>
          <button
            onClick={() => engine.setMetronome(!metronomeOn)}
            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
              metronomeOn
                ? "bg-amber-400 text-black"
                : "border border-white/20 text-white/70 hover:bg-white/10"
            }`}
          >
            {metronomeOn ? "Stop" : "Start"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(["1/4", "1/8", "1/16"] as const).map((sub) => (
            <button
              key={sub}
              onClick={() => engine.setMetronomeSubdivision(sub)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                metronomeSubdivision === sub
                  ? "bg-amber-400/30 text-amber-100"
                  : "border border-white/15 text-white/65 hover:bg-white/10"
              }`}
            >
              {sub}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1 text-[10px] text-white/65">
            <input
              type="checkbox"
              checked={metronomeAccentDownbeat}
              onChange={(e) => engine.setMetronomeAccent(e.target.checked)}
              className="accent-amber-400"
            />
            Accent the 1
          </label>
        </div>
        {more && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/45">
              Swing
            </span>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={metronomeSwing}
              onChange={(e) => engine.setMetronomeSwing(parseFloat(e.target.value))}
              className="flex-1 accent-amber-400"
              aria-label="Click swing amount"
            />
            <span className="font-mono text-[10px] text-white/70">
              {Math.round(metronomeSwing * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Latency calibration + quick links ───────────────────────── */}
      {more && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">
                Latency offset
              </span>
              <span className="font-mono text-[10px] text-white/70">
                {measuredDeviceLatencyMs.toFixed(1)} ms
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={120}
              step={0.5}
              value={measuredDeviceLatencyMs}
              onChange={(e) =>
                engine.setMeasuredDeviceLatencyMs(parseFloat(e.target.value))
              }
              className="mt-1 w-full accent-amber-400"
              aria-label="Measured device latency in milliseconds"
            />
            <button
              onClick={() => void engine.calibrateLatency()}
              className="mt-1 w-full rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10"
            >
              Auto-detect
            </button>
            <p className="mt-1 text-[9px] leading-snug text-white/45">
              Back-shifts recorded takes so they line up with what your
              cans heard.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={onOpenTakeBrowser}
              className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-left hover:bg-cyan-500/20"
            >
              <div className="text-[9px] font-black uppercase tracking-[0.28em] text-cyan-200">
                Takes
              </div>
              <div className="mt-0.5 text-xs font-bold">A/B + keeper picker</div>
            </button>
            <button
              onClick={onOpenWarmup}
              className="rounded-xl border border-pink-400/30 bg-pink-500/10 px-3 py-2 text-left hover:bg-pink-500/20"
            >
              <div className="text-[9px] font-black uppercase tracking-[0.28em] text-pink-200">
                Warm up
              </div>
              <div className="mt-0.5 text-xs font-bold">Vocal scales + drone</div>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
