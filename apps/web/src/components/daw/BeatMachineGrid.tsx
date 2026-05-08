"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { DRUM_LANES, STEPS, type BeatPattern, type DrumKind, type DrumKitId } from "./beatMachine";
import type { PatternBank } from "./dawEngine";

interface Props {
  pattern: BeatPattern;
  enabled: boolean;
  activeStep: number;
  activeBank: PatternBank;
  kit: DrumKitId;
  laneSampleNames: Record<DrumKind, string | null>;
  onToggleStep: (lane: DrumKind, step: number) => void;
  onToggleEnabled: () => void;
  onClear: () => void;
  onRenderToTrack: () => void;
  onSelectBank: (bank: PatternBank) => void;
  onSelectKit: (kit: DrumKitId) => void;
  onAssignLaneSample: (lane: DrumKind, file: File) => Promise<void> | void;
  onClearLaneSample: (lane: DrumKind) => void;
  onFillLane: (lane: DrumKind, on: boolean) => void;
  onRandomizeLane: (lane: DrumKind, density: number) => void;
  onShiftLane: (lane: DrumKind, direction: "left" | "right") => void;
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

const LANE_TEXT_CLASSES: Record<DrumKind, string> = {
  kick: "text-red-400",
  snare: "text-amber-400",
  clap: "text-violet-300",
  hat: "text-cyan-300",
  openHat: "text-sky-300",
  perc: "text-emerald-400",
  bass808: "text-pink-400",
  crash: "text-yellow-300",
};

const LANE_BG_CLASSES: Record<DrumKind, string> = {
  kick: "bg-red-500",
  snare: "bg-amber-500",
  clap: "bg-violet-400",
  hat: "bg-cyan-400",
  openHat: "bg-sky-400",
  perc: "bg-emerald-500",
  bass808: "bg-pink-500",
  crash: "bg-yellow-400",
};

export default function BeatMachineGrid({
  pattern,
  enabled,
  activeStep,
  activeBank,
  kit,
  laneSampleNames,
  onToggleStep,
  onToggleEnabled,
  onClear,
  onRenderToTrack,
  onSelectBank,
  onSelectKit,
  onAssignLaneSample,
  onClearLaneSample,
  onFillLane,
  onRandomizeLane,
  onShiftLane,
  rendering,
}: Props) {
  // Static array so React doesn't reflow the keys on each render.
  const stepIndices = useMemo(() => Array.from({ length: STEPS }, (_, i) => i), []);
  const [paintMode, setPaintMode] = useState<boolean | null>(null);
  const [dragLane, setDragLane] = useState<DrumKind | null>(null);
  const [previewingLane, setPreviewingLane] = useState<DrumKind | null>(null);
  const lanePreviewSourceRef = useRef<Record<DrumKind, Blob | null>>({
    kick: null,
    snare: null,
    clap: null,
    hat: null,
    openHat: null,
    perc: null,
    bass808: null,
    crash: null,
  });
  const lanePreviewUrlsRef = useRef<Record<DrumKind, string | null>>({
    kick: null,
    snare: null,
    clap: null,
    hat: null,
    openHat: null,
    perc: null,
    bass808: null,
    crash: null,
  });
  const lanePreviewAudioRef = useRef<Record<DrumKind, HTMLAudioElement | null>>({
    kick: null,
    snare: null,
    clap: null,
    hat: null,
    openHat: null,
    perc: null,
    bass808: null,
    crash: null,
  });
  const laneInputRefs = useRef<Record<DrumKind, HTMLInputElement | null>>({
    kick: null,
    snare: null,
    clap: null,
    hat: null,
    openHat: null,
    perc: null,
    bass808: null,
    crash: null,
  });

  useEffect(() => {
    const previewAudioByLane = lanePreviewAudioRef.current;
    const previewUrlByLane = lanePreviewUrlsRef.current;
    function stopPainting() {
      setPaintMode(null);
    }
    window.addEventListener("pointerup", stopPainting);
    return () => {
      window.removeEventListener("pointerup", stopPainting);
      for (const lane of DRUM_LANES) {
        previewAudioByLane[lane]?.pause();
        previewAudioByLane[lane] = null;
        const url = previewUrlByLane[lane];
        if (url) URL.revokeObjectURL(url);
        previewUrlByLane[lane] = null;
      }
    };
  }, []);

  function handleStepPaint(lane: DrumKind, step: number, on: boolean) {
    if (paintMode === null || on === paintMode) return;
    onToggleStep(lane, step);
  }

  async function handleLaneDrop(lane: DrumKind, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragLane(null);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await onAssignLaneSample(lane, file);
    lanePreviewSourceRef.current[lane] = file;
  }

  function previewLaneSample(lane: DrumKind) {
    const source = lanePreviewSourceRef.current[lane];
    if (!source) return;

    lanePreviewAudioRef.current[lane]?.pause();
    const previousUrl = lanePreviewUrlsRef.current[lane];
    if (previousUrl) URL.revokeObjectURL(previousUrl);

    const url = URL.createObjectURL(source);
    lanePreviewUrlsRef.current[lane] = url;
    const audio = new Audio(url);
    lanePreviewAudioRef.current[lane] = audio;
    setPreviewingLane(lane);
    audio.onended = () => {
      setPreviewingLane((current) => (current === lane ? null : current));
    };
    void audio.play().catch(() => {
      setPreviewingLane((current) => (current === lane ? null : current));
    });
  }

  function clearLaneSample(lane: DrumKind) {
    lanePreviewSourceRef.current[lane] = null;
    onClearLaneSample(lane);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-accent-300/85">
              Beat machine
            </p>
            <p className="mt-0.5 text-xs text-white/55">
              16-step · 8 lanes · kit presets or custom lane samples
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
            {BANKS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onSelectBank(b)}
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
            <div className={`w-14 shrink-0 text-[11px] font-black uppercase tracking-widest ${LANE_TEXT_CLASSES[lane]}`}>
              {LANE_LABELS[lane]}
            </div>
            <div
              className={`w-[152px] shrink-0 rounded-md border p-1 transition ${
                dragLane === lane ? "border-accent-400/70 bg-accent-500/10" : "border-transparent"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragLane(lane);
              }}
              onDragLeave={() => {
                setDragLane((current) => (current === lane ? null : current));
              }}
              onDrop={(event) => {
                void handleLaneDrop(lane, event);
              }}
            >
              <input
                ref={(el) => {
                  laneInputRefs.current[lane] = el;
                }}
                type="file"
                accept="audio/*,.wav,.mp3,.flac,.m4a,.aif,.aiff,.ogg"
                className="hidden"
                title={`Upload ${LANE_LABELS[lane]} sample`}
                aria-label={`Upload ${LANE_LABELS[lane]} sample`}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await onAssignLaneSample(lane, file);
                  lanePreviewSourceRef.current[lane] = file;
                }}
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => laneInputRefs.current[lane]?.click()}
                  className="rounded-md border border-white/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/75 hover:bg-white/10 transition"
                  title={`Assign a custom ${LANE_LABELS[lane]} one-shot`}
                >
                  Sample
                </button>
                {laneSampleNames[lane] && (
                  <button
                    type="button"
                    onClick={() => previewLaneSample(lane)}
                    className="rounded-md border border-cyan-400/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/10 transition"
                    title={`Preview custom ${LANE_LABELS[lane]} sample`}
                  >
                    {previewingLane === lane ? "Playing" : "Preview"}
                  </button>
                )}
                {laneSampleNames[lane] && (
                  <button
                    type="button"
                    onClick={() => clearLaneSample(lane)}
                    className="rounded-md border border-red-400/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-200 hover:bg-red-500/10 transition"
                    title={`Clear custom ${LANE_LABELS[lane]} sample`}
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="mt-0.5 truncate text-[9px] text-white/45" title={laneSampleNames[lane] ?? "Using kit sound"}>
                {laneSampleNames[lane] ?? "Using kit sound"}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onFillLane(lane, true)}
                  className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70 transition hover:bg-white/10"
                  title={`Turn on all ${LANE_LABELS[lane]} steps`}
                >
                  Fill
                </button>
                <button
                  type="button"
                  onClick={() => onRandomizeLane(lane, lane === "hat" || lane === "openHat" ? 0.55 : 0.3)}
                  className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70 transition hover:bg-white/10"
                  title={`Randomize ${LANE_LABELS[lane]} pattern`}
                >
                  Rand
                </button>
                <button
                  type="button"
                  onClick={() => onShiftLane(lane, "left")}
                  className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70 transition hover:bg-white/10"
                  title={`Shift ${LANE_LABELS[lane]} steps left`}
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => onShiftLane(lane, "right")}
                  className="rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70 transition hover:bg-white/10"
                  title={`Shift ${LANE_LABELS[lane]} steps right`}
                >
                  ▶
                </button>
              </div>
              <p className="mt-0.5 text-[9px] text-white/35">Drop audio here to assign lane</p>
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
                    onPointerDown={() => {
                      const next = !on;
                      setPaintMode(next);
                      onToggleStep(lane, step);
                    }}
                    onPointerEnter={() => {
                      handleStepPaint(lane, step, on);
                    }}
                    onPointerUp={() => setPaintMode(null)}
                    aria-label={`${LANE_LABELS[lane]} step ${step + 1}: ${on ? "on" : "off"}`}
                    className={`relative h-7 flex-1 rounded-md border transition ${
                      on
                        ? `border-transparent shadow-[0_0_18px_rgba(255,255,255,0.08)] ${LANE_BG_CLASSES[lane]}`
                        : isDownbeat
                          ? "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                    } ${isActive ? "ring-2 ring-white ring-offset-1 ring-offset-transparent" : ""}`}
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
