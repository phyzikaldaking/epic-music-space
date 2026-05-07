"use client";

import { useMemo } from "react";
import { DRUM_LANES, STEPS, type BeatPattern, type DrumKind, type DrumKitId } from "./beatMachine";
import type { PatternBank } from "./dawEngine";

interface Props {
  pattern: BeatPattern;
  enabled: boolean;
  activeStep: number;
  activeBank: PatternBank;
  kit: DrumKitId;
  onToggleStep: (lane: DrumKind, step: number) => void;
  onToggleEnabled: () => void;
  onClear: () => void;
  onRenderToTrack: () => void;
  onSelectBank: (bank: PatternBank) => void;
  onSelectKit: (kit: DrumKitId) => void;
  rendering?: boolean;
}

const BANKS: PatternBank[] = ["A", "B", "C", "D"];
// Modern kit roster — ordered by how often they get reached for in 2026
// production. The select stays alphabetical-ish within the production
// styles to make the dropdown scannable.
const KITS: { id: DrumKitId; label: string }[] = [
  { id: "trap", label: "Trap" },
  { id: "drill", label: "Drill" },
  { id: "afro", label: "Afro" },
  { id: "hyperpop", label: "Hyperpop" },
  { id: "boomBap", label: "Boom Bap" },
  { id: "lofi", label: "Lo-fi" },
  { id: "acoustic", label: "Acoustic" },
];

const LANE_LABELS: Record<DrumKind, string> = {
  kick: "Kick",
  snare: "Snare",
  clap: "Clap",
  hat: "Hat",
  openHat: "Open",
  perc: "Perc",
  bass808: "808",
  crash: "Crash",
};

// Lane palette tuned so adjacent lanes don't visually fuse — picked from
// the EMS brand neon set so the grid still reads on dark backgrounds.
const LANE_COLORS: Record<DrumKind, string> = {
  kick: "#ef4444",
  snare: "#f59e0b",
  clap: "#a78bfa",
  hat: "#22d3ee",
  openHat: "#06b6d4",
  perc: "#10b981",
  bass808: "#ec4899",
  crash: "#fcd34d",
};

export default function BeatMachineGrid({
  pattern,
  enabled,
  activeStep,
  activeBank,
  kit,
  onToggleStep,
  onToggleEnabled,
  onClear,
  onRenderToTrack,
  onSelectBank,
  onSelectKit,
  rendering,
}: Props) {
  // Static array so React doesn't reflow the keys on each render.
  const stepIndices = useMemo(() => Array.from({ length: STEPS }, (_, i) => i), []);

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-accent-300/85">
              Beat machine
            </p>
            <p className="mt-0.5 text-xs text-white/55">
              16-step · 8 lanes · trap / drill / afro / hyperpop / boom-bap kits
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
            {BANKS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onSelectBank(b)}
                aria-pressed={b === activeBank}
                className={`min-w-7 rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-widest transition ${
                  b === activeBank
                    ? "bg-accent-500 text-black"
                    : "text-white/55 hover:bg-white/10"
                }`}
                title={`Pattern bank ${b}`}
              >
                {b}
              </button>
            ))}
          </div>

          <select
            value={kit}
            onChange={(e) => onSelectKit(e.target.value as DrumKitId)}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs font-mono text-white"
            title="Drum kit preset"
          >
            {KITS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleEnabled}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition ${
              enabled
                ? "bg-accent-500 text-black"
                : "border border-white/15 text-white/70 hover:bg-white/10"
            }`}
          >
            {enabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/65 hover:bg-white/10 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onRenderToTrack}
            disabled={rendering}
            className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-200 hover:bg-brand-500/25 disabled:opacity-50 transition"
          >
            {rendering ? "Rendering…" : "Render to Beat track"}
          </button>
        </div>
      </header>

      <div className="space-y-1.5">
        {DRUM_LANES.map((lane) => (
          <div key={lane} className="flex items-center gap-2">
            <div
              className="w-14 shrink-0 text-[11px] font-black uppercase tracking-widest"
              style={{ color: LANE_COLORS[lane] }}
            >
              {LANE_LABELS[lane]}
            </div>
            <div className="flex flex-1 gap-[3px]">
              {stepIndices.map((step) => {
                const on = pattern[lane][step];
                const isActive = enabled && activeStep === step;
                const isDownbeat = step % 4 === 0;
                return (
                  <button
                    key={step}
                    type="button"
                    onClick={() => onToggleStep(lane, step)}
                    aria-label={`${LANE_LABELS[lane]} step ${step + 1}: ${on ? "on" : "off"}`}
                    className={`relative h-7 flex-1 rounded-md border transition ${
                      on
                        ? "border-transparent shadow-[0_0_18px_rgba(255,255,255,0.08)]"
                        : isDownbeat
                          ? "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                    }`}
                    style={{
                      background: on ? LANE_COLORS[lane] : undefined,
                      outline: isActive ? "2px solid white" : undefined,
                      outlineOffset: isActive ? "1px" : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1 pl-16">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-1 justify-start">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/30">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
