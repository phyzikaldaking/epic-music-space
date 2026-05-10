"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  DRUM_LANES,
  STEPS,
  scheduleDrumHit,
  type BeatPattern,
  type BeatStepOptions,
  type BeatFillPreset,
  type DrumKind,
  type DrumKitId,
} from "./beatMachine";
import type { LaneEqRecommendation, LaneFrequencyProfile, PatternBank } from "./dawEngine";
import { StudioTooltip } from "@/components/ui/StudioTooltip";
import { tooltips } from "./tooltipCopy";

interface Props {
  pattern: BeatPattern;
  enabled: boolean;
  activeStep: number;
  activeBank: PatternBank;
  kit: DrumKitId;
  /** Sparse per-step modifiers — velocity, probability, microShift,
   *  repeats. Cells render proportional fill heights based on velocity
   *  and a small badge when probability < 1. */
  stepOptions: Partial<Record<DrumKind, Record<number, BeatStepOptions>>>;
  /** Optional secondary kit per lane. Renders a tiny chip in the lane
   *  header so the user knows two kits are stacking on hit. */
  layerKitB: Partial<Record<DrumKind, DrumKitId>>;
  /** Round-robin variant filenames per lane (max 3). Shift+drop on the
   *  lane appends a variant; clear button on each chip removes one. */
  laneVariantNames: Record<DrumKind, string[]>;
  /** Global swing 0..0.66 — every 2nd 16th gets shifted forward. */
  swing: number;
  /** Humanize jitter in ms (0..15). */
  humanizeMs: number;
  /** When true, scheduler auto-paints a fill on the last bar before a
   *  queued bank switch. */
  fillsEnabled: boolean;
  fillPreset: BeatFillPreset;
  /** Live stutter divisor 0..4 (0 = off). 1/4..1/32 subdivisions. */
  stutter: number;
  laneSampleNames: Record<DrumKind, string | null>;
  laneFrequencyProfiles: Record<DrumKind, LaneFrequencyProfile>;
  laneRecommendations: Partial<Record<DrumKind, LaneEqRecommendation>>;
  recentlyAppliedLanes: Set<DrumKind>;
  onApplyLaneRecommendation: (rec: LaneEqRecommendation) => void;
  previewRecommendation: LaneEqRecommendation | null;
  onTogglePreviewRecommendation: (rec: LaneEqRecommendation | null) => void;
  onToggleStep: (lane: DrumKind, step: number) => void;
  onSetStepOptions: (lane: DrumKind, step: number, opts: BeatStepOptions | null) => void;
  onToggleEnabled: () => void;
  onClear: () => void;
  onSuggestPattern: () => void;
  onRenderToTrack: () => void;
  onSelectBank: (bank: PatternBank) => void;
  /** Clone the current active pattern into the target bank. Wired to
   *  Shift+click on a bank tab — pattern + step options copy together. */
  onCopyPatternToBank: (target: PatternBank) => void;
  onSelectKit: (kit: DrumKitId) => void;
  onSetLaneLayerKit: (lane: DrumKind, kit: DrumKitId | null) => void;
  /** Per-lane pitch (-12..+12 semitones). 0 = unity. Affects the synth
   *  kit and any loaded sample. The single most-requested move for
   *  tuning 808 kicks to song key. */
  laneSemis: Partial<Record<DrumKind, number>>;
  onSetLaneSemis: (lane: DrumKind, semis: number) => void;
  /** Per-lane reverse-sample toggle. Synth-only lanes ignore it. */
  laneReversed: Partial<Record<DrumKind, boolean>>;
  onSetLaneReversed: (lane: DrumKind, reversed: boolean) => void;
  /** Per-lane display name override (max 12 chars). Empty/unset =
   *  canonical label. Lets producers rename lanes for percussion-only
   *  kits or hybrid stems. */
  laneNames: Partial<Record<DrumKind, string>>;
  onSetLaneName: (lane: DrumKind, name: string) => void;
  onSetSwing: (swing: number) => void;
  onSetHumanize: (humanizeMs: number) => void;
  onSetFillsEnabled: (on: boolean) => void;
  onSetFillPreset: (preset: BeatFillPreset) => void;
  onSetStutter: (divisor: number) => void;
  onAssignLaneSample: (lane: DrumKind, file: File) => Promise<void> | void;
  onAddLaneVariant: (lane: DrumKind, file: File) => Promise<void> | void;
  onClearLaneVariants: (lane: DrumKind) => void;
  onClearLaneSample: (lane: DrumKind) => void;
  onFillLane: (lane: DrumKind, on: boolean) => void;
  onRandomizeLane: (lane: DrumKind, density: number) => void;
  onShiftLane: (lane: DrumKind, direction: "left" | "right") => void;
  rendering?: boolean;
}

const VELOCITY_CYCLE = [1, 1.25, 0.25, 0.5, 0.75]; // tap order on shift+click
const PROBABILITY_CYCLE = [1, 0.75, 0.5, 0.25];

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
  stepOptions,
  layerKitB,
  laneVariantNames,
  swing,
  humanizeMs,
  fillsEnabled,
  fillPreset,
  stutter,
  laneSampleNames,
  laneFrequencyProfiles,
  laneRecommendations,
  recentlyAppliedLanes,
  onApplyLaneRecommendation,
  previewRecommendation,
  onTogglePreviewRecommendation,
  onToggleStep,
  onSetStepOptions,
  onToggleEnabled,
  onClear,
  onSuggestPattern,
  onRenderToTrack,
  onSelectBank,
  onCopyPatternToBank,
  onSelectKit,
  onSetLaneLayerKit,
  laneSemis,
  onSetLaneSemis,
  laneReversed,
  onSetLaneReversed,
  laneNames,
  onSetLaneName,
  onSetSwing,
  onSetHumanize,
  onSetFillsEnabled,
  onSetFillPreset,
  onSetStutter,
  onAssignLaneSample,
  onAddLaneVariant,
  onClearLaneVariants,
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
  // Probability popover. null = closed; otherwise pin coords + identity.
  const [probMenu, setProbMenu] = useState<{
    lane: DrumKind;
    step: number;
    x: number;
    y: number;
  } | null>(null);
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
    // Shift-drop appends a round-robin variant instead of replacing the
    // primary sample. Up to 3 variants per lane.
    if (event.shiftKey && laneSampleNames[lane]) {
      await onAddLaneVariant(lane, file);
      return;
    }
    await onAssignLaneSample(lane, file);
    lanePreviewSourceRef.current[lane] = file;
  }

  function cycleStepVelocity(lane: DrumKind, step: number) {
    const cur = stepOptions[lane]?.[step]?.velocity ?? 1;
    // Find the current value in the cycle (defaults to 1 at idx 0) and
    // bump to the next.
    let idx = VELOCITY_CYCLE.findIndex((v) => Math.abs(v - cur) < 0.01);
    if (idx < 0) idx = 0;
    const next = VELOCITY_CYCLE[(idx + 1) % VELOCITY_CYCLE.length] ?? 1;
    onSetStepOptions(lane, step, { velocity: next });
  }

  function setStepProbability(lane: DrumKind, step: number, probability: number) {
    onSetStepOptions(lane, step, { probability });
    setProbMenu(null);
  }

  function openProbMenu(lane: DrumKind, step: number, e: ReactMouseEvent) {
    e.preventDefault();
    setProbMenu({ lane, step, x: e.clientX, y: e.clientY });
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
                onClick={(e) => {
                  // Shift-click copies the active pattern into the
                  // target bank instead of switching to it. The user
                  // doesn't lose their active edit; the dest just
                  // mirrors current state.
                  if (e.shiftKey && b !== activeBank) {
                    onCopyPatternToBank(b);
                    return;
                  }
                  onSelectBank(b);
                }}
                className={`min-w-7 rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
                  b === activeBank
                    ? "bg-accent-500 text-black"
                    : "text-white/55 hover:bg-white/10"
                }`}
                title={
                  b === activeBank
                    ? `Pattern bank ${b} · current`
                    : `Pattern bank ${b} · click to switch, shift+click to copy ${activeBank} here`
                }
              >
                {b}
              </button>
            ))}
          </div>

          <KitPickerStrip kit={kit} onSelect={onSelectKit} />
          <BulkDropZone onAssignLaneSample={onAssignLaneSample} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StudioTooltip label={tooltips.beatOnOff}>
          <button
            type="button"
            onClick={onToggleEnabled}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
              enabled
                ? "bg-accent-500 text-black"
                : "border border-white/15 text-white/70 hover:bg-white/10"
            }`}
          >
            {enabled ? "On" : "Off"}
          </button>
          </StudioTooltip>
          <StudioTooltip label="Clear every step in every lane.">
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/65 hover:bg-white/10 transition"
          >
            Clear
          </button>
          </StudioTooltip>
          <StudioTooltip label={tooltips.beatSuggest}>
          <button
            type="button"
            onClick={onSuggestPattern}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/20 transition"
          >
            Suggest
          </button>
          </StudioTooltip>
          <StudioTooltip label={tooltips.beatRender}>
          <button
            type="button"
            onClick={onRenderToTrack}
            disabled={rendering}
            className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-200 hover:bg-brand-500/25 disabled:opacity-50 transition"
          >
            {rendering ? "Rendering…" : "Render to Beat track"}
          </button>
          </StudioTooltip>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/55">
          Swing
          <input
            type="range"
            min={0}
            max={0.66}
            step={0.02}
            value={swing}
            onChange={(e) => onSetSwing(Number(e.target.value))}
            className="w-20 accent-accent-500"
            aria-label="Beat machine swing"
            title="Shift every 2nd 16th forward. 0 = robotic, 0.5 = triplet feel."
          />
          <span className="w-8 text-right font-mono text-[10px] text-white/70">
            {Math.round(swing * 100)}%
          </span>
        </label>
        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/55">
          Human
          <input
            type="range"
            min={0}
            max={15}
            step={0.5}
            value={humanizeMs}
            onChange={(e) => onSetHumanize(Number(e.target.value))}
            className="w-20 accent-accent-500"
            aria-label="Beat machine humanize"
            title="Random per-step timing jitter in ms. 0 = robotic; 5–8 = recorded feel."
          />
          <span className="w-10 text-right font-mono text-[10px] text-white/70">
            ±{humanizeMs.toFixed(1)} ms
          </span>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
          <input
            type="checkbox"
            checked={fillsEnabled}
            onChange={(e) => onSetFillsEnabled(e.target.checked)}
            aria-label="Auto-fill on bank switch"
            className="h-3.5 w-3.5 accent-accent-500"
          />
          Fill on switch
        </label>
        {fillsEnabled && (
          <select
            value={fillPreset}
            onChange={(e) => onSetFillPreset(e.target.value as BeatFillPreset)}
            aria-label="Fill preset"
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/85"
            title="Drum fill played on the last bar before a queued bank switch."
          >
            <option value="simple">Simple</option>
            <option value="medium">Medium</option>
            <option value="wild">Wild</option>
          </select>
        )}
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/55">
            Stutter
          </span>
          {[
            { label: "Off", v: 0 },
            { label: "1/4", v: 1 },
            { label: "1/8", v: 2 },
            { label: "1/16", v: 3 },
            { label: "1/32", v: 4 },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => onSetStutter(opt.v)}
              className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition ${
                stutter === opt.v
                  ? "bg-accent-500 text-black"
                  : "border border-white/15 text-white/65 hover:bg-white/10"
              }`}
              title={`Stutter at ${opt.label}. Hold 1–4 during playback as a hotkey.`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="ml-auto text-[10px] text-white/45">
          Shift+click step = velocity · Right-click = probability · Shift+drop sample = layer
        </p>
      </div>

      <div className="space-y-1.5">
        {DRUM_LANES.map((lane) => (
          <div key={lane} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = window.prompt(
                  `Rename ${LANE_LABELS[lane]} lane (blank to reset)`,
                  laneNames[lane] ?? "",
                );
                if (next !== null) onSetLaneName(lane, next);
              }}
              className={`w-14 shrink-0 truncate text-left text-[11px] font-black uppercase tracking-widest hover:opacity-80 focus:outline-none focus-visible:underline ${LANE_TEXT_CLASSES[lane]}`}
              title={`Click to rename — currently "${laneNames[lane] ?? LANE_LABELS[lane]}"`}
              aria-label={`Rename ${LANE_LABELS[lane]} lane`}
            >
              {laneNames[lane] ?? LANE_LABELS[lane]}
            </button>
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
              <p
                className={`mt-0.5 truncate text-[9px] ${
                  laneFrequencyProfiles[lane].risk === "high"
                    ? "text-red-200"
                    : laneFrequencyProfiles[lane].risk === "medium"
                      ? "text-amber-200"
                      : "text-emerald-200/85"
                }`}
                title={laneFrequencyProfiles[lane].guidance}
              >
                {Math.round(laneFrequencyProfiles[lane].dominantHz)} Hz center · low {Math.round(laneFrequencyProfiles[lane].lowBandRatio * 100)}%
              </p>
              {laneRecommendations[lane] && (
                <div className="mt-0.5 flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const rec = laneRecommendations[lane];
                      if (rec) onTogglePreviewRecommendation(rec);
                    }}
                    className={`flex-1 truncate rounded border px-1 py-[1px] text-[9px] transition ${
                      previewRecommendation?.lane === lane && previewRecommendation?.type === laneRecommendations[lane]?.type
                        ? "border-yellow-300/60 bg-yellow-500/30 text-yellow-100"
                        : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                    }`}
                    title="Preview this recommendation (hear before/after). Cmd+Left/Right to cycle."
                  >
                    👁 preview
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const rec = laneRecommendations[lane];
                      if (rec) onApplyLaneRecommendation(rec);
                    }}
                    className={`flex-1 truncate rounded border px-1 py-[1px] text-[9px] transition ${
                      recentlyAppliedLanes.has(lane)
                        ? "border-emerald-300/60 bg-emerald-500/30 text-emerald-100 shadow-lg shadow-emerald-500/50"
                        : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                    }`}
                    title={`${laneRecommendations[lane]?.reason} · Cmd+Y to apply top`}
                  >
                    ✓ apply
                  </button>
                </div>
              )}
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
              <p className="mt-0.5 text-[9px] text-white/35">
                Drop audio · Shift+drop to add variant
              </p>
              {laneVariantNames[lane].length > 0 && (
                <div className="mt-0.5 flex items-center gap-1">
                  {laneVariantNames[lane].map((name, idx) => (
                    <span
                      key={`${name}-${idx}`}
                      className="truncate rounded border border-cyan-300/30 bg-cyan-500/10 px-1 text-[8px] font-bold text-cyan-100"
                      title={`Round-robin variant ${idx + 2}: ${name}`}
                    >
                      v{idx + 2}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => onClearLaneVariants(lane)}
                    className="rounded border border-white/15 px-1 text-[8px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10"
                    title="Clear all round-robin variants for this lane"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className="text-[8px] font-bold uppercase tracking-widest text-white/40"
                  title="Layer a second kit's synth on this lane for hybrid drums"
                >
                  Layer
                </span>
                <select
                  value={layerKitB[lane] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetLaneLayerKit(lane, v === "" ? null : (v as DrumKitId));
                  }}
                  aria-label={`Layer kit for ${LANE_LABELS[lane]}`}
                  className="flex-1 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white/80"
                  title="Layer a secondary kit's synth on every hit"
                >
                  <option value="">Off</option>
                  {KITS.filter((k) => k.id !== kit).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className="text-[8px] font-bold uppercase tracking-widest text-white/40"
                  title="Tune the lane in semitones — works for both the kit synth and any loaded sample"
                >
                  Tune
                </span>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  value={laneSemis[lane] ?? 0}
                  onChange={(e) => onSetLaneSemis(lane, Number(e.target.value))}
                  aria-label={`${LANE_LABELS[lane]} pitch in semitones`}
                  className="flex-1 accent-accent-500"
                  title={`${LANE_LABELS[lane]} pitch (${(laneSemis[lane] ?? 0) > 0 ? "+" : ""}${laneSemis[lane] ?? 0} st)`}
                />
                <span className="w-7 text-right font-mono text-[8px] tabular-nums text-white/70">
                  {(laneSemis[lane] ?? 0) > 0 ? "+" : ""}{laneSemis[lane] ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() => onSetLaneReversed(lane, !laneReversed[lane])}
                  className={`rounded border px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider transition ${
                    laneReversed[lane]
                      ? "border-amber-300/55 bg-amber-400/15 text-amber-100"
                      : "border-white/10 text-white/45 hover:bg-white/10"
                  }`}
                  title={
                    laneReversed[lane]
                      ? "Playing this lane's sample reversed — click to disable"
                      : "Reverse this lane's sample (no effect on synth-only lanes)"
                  }
                  aria-pressed={laneReversed[lane] ? "true" : "false"}
                  aria-label={`Reverse ${LANE_LABELS[lane]} sample`}
                >
                  ⏪
                </button>
              </div>
            </div>
            <div className="flex flex-1 gap-[3px]">
              {stepIndices.map((step) => {
                const on = pattern[lane][step];
                const isActive = enabled && activeStep === step;
                const isDownbeat = step % 4 === 0;
                const opts = stepOptions[lane]?.[step];
                const velocity = opts?.velocity ?? 1;
                const probability = opts?.probability ?? 1;
                // Velocity → fill height. 1 = full; 0.25 = 25%; 1.25 = 100%+glow.
                const fillPct = Math.min(100, Math.round(Math.min(1, velocity) * 100));
                return (
                  <button
                    key={step}
                    type="button"
                    onPointerDown={(e) => {
                      // Shift-click cycles velocity instead of toggling.
                      if (e.shiftKey && on) {
                        cycleStepVelocity(lane, step);
                        return;
                      }
                      const next = !on;
                      setPaintMode(next);
                      onToggleStep(lane, step);
                    }}
                    onPointerEnter={() => {
                      handleStepPaint(lane, step, on);
                    }}
                    onPointerUp={() => setPaintMode(null)}
                    onContextMenu={(e) => {
                      // Right-click on an enabled step opens the probability menu.
                      if (!on) {
                        e.preventDefault();
                        return;
                      }
                      openProbMenu(lane, step, e);
                    }}
                    aria-label={`${LANE_LABELS[lane]} step ${step + 1}: ${on ? "on" : "off"}${velocity !== 1 ? ` · vel ${Math.round(velocity * 100)}` : ""}${probability < 1 ? ` · ${Math.round(probability * 100)}%` : ""}`}
                    className={`relative h-7 flex-1 overflow-hidden rounded-md border transition ${
                      on
                        ? `border-transparent shadow-[0_0_18px_rgba(255,255,255,0.08)] bg-white/[0.04]`
                        : isDownbeat
                          ? "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                    } ${isActive ? "ring-2 ring-white ring-offset-1 ring-offset-transparent" : ""}`}
                  >
                    {on && (
                      <span
                        className={`absolute bottom-0 left-0 right-0 ${LANE_BG_CLASSES[lane]} ${velocity > 1 ? "shadow-[0_0_8px_rgba(255,255,255,0.5)]" : ""}`}
                        style={{ height: `${fillPct}%` }}
                        aria-hidden
                      />
                    )}
                    {on && probability < 1 && (
                      <span
                        className="absolute top-0.5 right-0.5 rounded-full bg-black/55 px-1 text-[7px] font-black text-white/85"
                        aria-hidden
                      >
                        {Math.round(probability * 100)}
                      </span>
                    )}
                    {on && (opts?.repeats ?? 0) > 0 && (
                      <span
                        className="absolute top-0.5 left-0.5 text-[7px] font-black text-white/85"
                        aria-hidden
                      >
                        ×{(opts?.repeats ?? 0) + 1}
                      </span>
                    )}
                  </button>
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

      {probMenu && (
        <ProbabilityMenu
          x={probMenu.x}
          y={probMenu.y}
          current={stepOptions[probMenu.lane]?.[probMenu.step]?.probability ?? 1}
          repeats={stepOptions[probMenu.lane]?.[probMenu.step]?.repeats ?? 0}
          onPick={(p) => setStepProbability(probMenu.lane, probMenu.step, p)}
          onSetRepeats={(r) =>
            onSetStepOptions(probMenu.lane, probMenu.step, { repeats: r })
          }
          onClear={() => {
            onSetStepOptions(probMenu.lane, probMenu.step, null);
            setProbMenu(null);
          }}
          onClose={() => setProbMenu(null)}
        />
      )}
    </section>
  );
}

// Floating popover for setting a step's probability + per-step repeat
// count. Positioned at the right-click coords; closes on backdrop click
// or Escape. Clear button removes ALL options for the step (velocity,
// probability, microShift, repeats) so undo is one click.
function ProbabilityMenu({
  x,
  y,
  current,
  repeats,
  onPick,
  onSetRepeats,
  onClear,
  onClose,
}: {
  x: number;
  y: number;
  current: number;
  repeats: number;
  onPick: (probability: number) => void;
  onSetRepeats: (repeats: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <>
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Step modifiers"
        className="fixed z-[101] rounded-lg border border-white/15 bg-[#0a0a10]/95 p-2 shadow-2xl shadow-black/50"
        style={{ left: x, top: y }}
      >
        <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-white/55">
          Probability
        </p>
        <div className="flex items-center gap-1">
          {PROBABILITY_CYCLE.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest transition ${
                Math.abs(current - p) < 0.01
                  ? "bg-accent-500 text-black"
                  : "border border-white/15 text-white/70 hover:bg-white/10"
              }`}
            >
              {Math.round(p * 100)}%
            </button>
          ))}
        </div>
        <p className="mt-2 mb-1 text-[9px] font-black uppercase tracking-widest text-white/55">
          Repeats (stutter)
        </p>
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onSetRepeats(r)}
              className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest transition ${
                repeats === r
                  ? "bg-accent-500 text-black"
                  : "border border-white/15 text-white/70 hover:bg-white/10"
              }`}
              title={`Fire ${r + 1} hit${r === 0 ? "" : "s"} inside this step`}
            >
              ×{r + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="mt-2 w-full rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-500/20"
        >
          Reset step
        </button>
      </div>
    </>
  );
}

// Inline kit picker that auditions a one-bar kick/snare/hat preview on
// hover using the hovered kit's synth, without committing the project's
// kit selection. Click commits like the old dropdown. Uses a shared,
// lazily-constructed AudioContext that lives in a ref so we don't open
// a new context per hover (Safari caps active contexts at 6).
function KitPickerStrip({
  kit,
  onSelect,
}: {
  kit: DrumKitId;
  onSelect: (kit: DrumKitId) => void;
}) {
  const auditionCtxRef = useRef<AudioContext | null>(null);
  const auditionTimerRef = useRef<number | null>(null);

  function ensureAuditionCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (auditionCtxRef.current) return auditionCtxRef.current;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    auditionCtxRef.current = new Ctor();
    return auditionCtxRef.current;
  }

  function audition(kitId: DrumKitId) {
    const ctx = ensureAuditionCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    // Fire kick / hat / snare / hat at 120 BPM — gives the user a
    // 0.5-second taste of the kit's character without pretending to
    // play their actual pattern.
    const now = ctx.currentTime + 0.02;
    const stepSec = 0.13;
    const dest = ctx.destination;
    scheduleDrumHit(ctx, dest, "kick", { when: now, kit: kitId, velocity: 0.9 });
    scheduleDrumHit(ctx, dest, "hat", { when: now + stepSec, kit: kitId, velocity: 0.7 });
    scheduleDrumHit(ctx, dest, "snare", { when: now + stepSec * 2, kit: kitId, velocity: 0.95 });
    scheduleDrumHit(ctx, dest, "hat", { when: now + stepSec * 3, kit: kitId, velocity: 0.6 });
  }

  function scheduleAudition(kitId: DrumKitId) {
    if (auditionTimerRef.current !== null) {
      clearTimeout(auditionTimerRef.current);
    }
    // 180ms hover-debounce so a sweep across the strip doesn't fire
    // every kit. Long enough to feel intentional, short enough to
    // still feel like hover.
    auditionTimerRef.current = window.setTimeout(() => {
      audition(kitId);
      auditionTimerRef.current = null;
    }, 180);
  }

  function cancelPending() {
    if (auditionTimerRef.current !== null) {
      clearTimeout(auditionTimerRef.current);
      auditionTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      cancelPending();
      const ctx = auditionCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
    };
  }, []);

  return (
    <StudioTooltip label="Hover a kit to audition · click to apply">
      <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-black/40 p-1">
        {KITS.map((k) => {
          const active = k.id === kit;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => {
                cancelPending();
                onSelect(k.id);
              }}
              onMouseEnter={() => scheduleAudition(k.id)}
              onMouseLeave={cancelPending}
              onFocus={() => scheduleAudition(k.id)}
              onBlur={cancelPending}
              className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
                active
                  ? "bg-accent-500 text-black"
                  : "text-white/65 hover:bg-white/10"
              }`}
              title={`${k.label} — hover to audition`}
              aria-pressed={active ? "true" : "false"}
              aria-label={`${k.label} kit${active ? " (active)" : ""}`}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </StudioTooltip>
  );
}

// Drop multiple sample files at once and the strip pattern-matches each
// filename to the right lane (kick.wav → kick lane, snare-1.wav →
// snare, etc.). Single drop replaces the whole kit instead of 8 manual
// drag-and-drops. Filename matches are fuzzy: a file with "808" in its
// name goes to the bass808 lane; "openhat" / "oh" → openHat; etc.
function BulkDropZone({
  onAssignLaneSample,
}: {
  onAssignLaneSample: (lane: DrumKind, file: File) => Promise<void> | void;
}) {
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  function matchLane(name: string): DrumKind | null {
    const n = name.toLowerCase();
    // Order matters: more specific matches before less specific ones so
    // "openhat" doesn't get caught by the "hat" rule.
    if (/(open[\s_-]*hat|\boh[\s_-]|\boh\.)/.test(n)) return "openHat";
    if (/808|sub|bass[\s_-]?808/.test(n)) return "bass808";
    if (/crash|cymbal|ride/.test(n)) return "crash";
    if (/snare|snr|\bsd\b/.test(n)) return "snare";
    if (/clap|hand[\s_-]?clap/.test(n)) return "clap";
    if (/(hi[\s_-]?hat|\bhat\b|\bch\b|hh)/.test(n)) return "hat";
    if (/perc|tom|conga|bongo|shaker|tamb|cowbell/.test(n)) return "perc";
    if (/kick|\bbd\b|bass[\s_-]?drum/.test(n)) return "kick";
    return null;
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    const audio = files.filter(
      (f) => f.type.startsWith("audio/") || /\.(wav|mp3|flac|m4a|aif|aiff|ogg)$/i.test(f.name),
    );
    if (audio.length === 0) return;
    setBusy(true);
    try {
      // Track which lanes we've already assigned so the first match
      // wins for duplicates (kick.wav + kick-2.wav → only kick.wav lands).
      const taken = new Set<DrumKind>();
      for (const file of audio) {
        const lane = matchLane(file.name);
        if (!lane || taken.has(lane)) continue;
        taken.add(lane);
        await onAssignLaneSample(lane, file);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => void handleDrop(e)}
      className={`flex items-center gap-1.5 rounded-lg border-2 border-dashed px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
        hover
          ? "border-cyan-300/70 bg-cyan-400/10 text-cyan-100"
          : "border-white/15 bg-black/20 text-white/55"
      }`}
      title="Drop a folder or multiple samples — filenames pattern-match to lanes (kick.wav → kick, etc.)"
      role="region"
      aria-label="Bulk sample drop zone"
    >
      <span aria-hidden>📦</span>
      <span>{busy ? "Loading…" : "Drop kit"}</span>
    </div>
  );
}
