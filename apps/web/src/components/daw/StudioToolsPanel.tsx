"use client";

import { useRef, useState } from "react";
import type { DawEngine, TrackState } from "./dawEngine";

// Audio-process tools panel — the modern DAW "production utilities"
// strip that producers reach for between writing and mixing. Each
// button mutates the focused track's buffer in place via an engine
// method; the engine takes a snapshot first so Cmd-Z restores the
// original.
//
// Buttons:
//   - Reverse (one-click reverse swell into the drop)
//   - Stutter (beat-repeat the tail)
//   - Vocal stack (4-voice harmony doubler)
//   - Chop to slices (auto-detect transients, drop one new track per slice)
//   - Stem export (zip all tracks as WAVs for sending to a mix engineer)
//   - Reference loader (load a commercial reference, A/B vs your mix)

type Props = {
  engine: DawEngine;
  focusedTrack: TrackState | null;
  onNotice: (tone: "success" | "error" | "info" | "warning", message: string) => void;
  onAfterMutate?: () => void;
};

export default function StudioToolsPanel({
  engine,
  focusedTrack,
  onNotice,
  onAfterMutate,
}: Props) {
  const referenceFileRef = useRef<HTMLInputElement | null>(null);
  const [stutterBeats, setStutterBeats] = useState(0.5);
  const [stutterTiles, setStutterTiles] = useState(4);

  const id = focusedTrack?.id;
  const hasAudio = focusedTrack?.hasAudio ?? false;

  function runReverse() {
    if (!id) return;
    if (!engine.reverseTrackAudio(id)) {
      onNotice("error", "Pick a track with audio first.");
      return;
    }
    onNotice("success", "Reversed.");
    onAfterMutate?.();
  }

  function runStutter() {
    if (!id) return;
    if (!engine.stutterTrackAudio(id, stutterBeats, stutterTiles)) {
      onNotice("error", "Track is too short to stutter.");
      return;
    }
    onNotice("success", `Stuttered last ${stutterBeats} beats × ${stutterTiles}.`);
    onAfterMutate?.();
  }

  function runVocalStack() {
    if (!id) return;
    if (!engine.applyVocalStack(id, -6)) {
      onNotice("error", "Pick a vocal track with audio.");
      return;
    }
    onNotice("success", "Stacked + doubled.");
    onAfterMutate?.();
  }

  async function runStemExport() {
    const stems = engine.exportStems();
    if (stems.length === 0) {
      onNotice("error", "No tracks with audio to export.");
      return;
    }
    // Trigger a per-stem download. We don't zip in-browser because
    // JSZip would be a hefty added dep; sequential downloads are fine
    // for a < 10-track session and browsers handle the queue.
    for (const stem of stems) {
      const url = URL.createObjectURL(stem.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${sanitize(stem.name)}.wav`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a beat to start the download before revoking
      // the URL — Safari especially is touchy here.
      await new Promise((r) => window.setTimeout(r, 80));
      URL.revokeObjectURL(url);
    }
    onNotice(
      "success",
      `Exported ${stems.length} stem${stems.length === 1 ? "" : "s"} as WAV.`,
    );
  }

  async function runReferenceLoad(file: File) {
    const ok = await engine.setReferenceTrack(file);
    if (!ok) {
      onNotice("error", "Couldn't decode that file as a reference.");
      return;
    }
    engine.setReferenceEnabled(true);
    onNotice("success", `Loaded "${file.name}" as reference.`);
  }

  return (
    <section
      className="rounded-2xl border border-violet-500/25 bg-black/40 p-3 text-[11px]"
      data-studio-section="studio-tools"
    >
      <header className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.28em] text-violet-200">
            Tools
          </span>
          <span className="text-[10px] uppercase tracking-widest text-white/55">
            Production utilities — focused on {focusedTrack?.name ?? "—"}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {/* Reverse */}
        <ToolButton
          label="Reverse"
          hint="Flip the buffer end-to-front"
          icon="⏪"
          disabled={!hasAudio}
          onClick={runReverse}
        />

        {/* Vocal stack */}
        <ToolButton
          label="Stack vocals"
          hint="4-voice harmony doubler"
          icon="🎤"
          disabled={!hasAudio}
          onClick={runVocalStack}
        />

        {/* Stem export — doesn't need a focused track */}
        <ToolButton
          label="Export stems"
          hint="Download each track as WAV"
          icon="📦"
          onClick={() => void runStemExport()}
        />

        {/* Reference loader */}
        <ToolButton
          label="Load reference"
          hint="A/B vs a commercial mix"
          icon="🎯"
          onClick={() => referenceFileRef.current?.click()}
        />
        <input
          ref={referenceFileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void runReferenceLoad(f);
            e.currentTarget.value = "";
          }}
        />

        {/* Stutter (with inline params so producers can dial it in) */}
        <div className="col-span-2 rounded-xl border border-white/15 bg-white/[0.03] p-2 sm:col-span-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-200">
              Stutter
            </span>
            <button
              onClick={runStutter}
              disabled={!hasAudio}
              className={`rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                hasAudio
                  ? "bg-violet-400/30 text-violet-100 hover:bg-violet-400/50"
                  : "bg-white/5 text-white/30"
              }`}
            >
              Apply
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/45">
                Beats
              </span>
              <select
                value={stutterBeats}
                onChange={(e) => setStutterBeats(parseFloat(e.target.value))}
                className="rounded-md border border-white/15 bg-black/30 px-1 py-0.5 text-[11px]"
              >
                <option value="0.25">1/16</option>
                <option value="0.5">1/8</option>
                <option value="1">1/4</option>
                <option value="2">1/2</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/45">
                Repeats
              </span>
              <input
                type="number"
                min={2}
                max={16}
                value={stutterTiles}
                onChange={(e) =>
                  setStutterTiles(Math.max(2, Math.min(16, parseInt(e.target.value) || 4)))
                }
                className="w-14 rounded-md border border-white/15 bg-black/30 px-1 py-0.5 text-right text-[11px]"
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function ToolButton({
  label,
  hint,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  icon: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition ${
        disabled
          ? "border-white/10 bg-white/[0.02] text-white/30 cursor-not-allowed"
          : "border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
      }`}
    >
      <div className="text-base">{icon}</div>
      <div className="text-[11px] font-bold uppercase tracking-widest">{label}</div>
      <div className="text-[9px] text-white/45">{hint}</div>
    </button>
  );
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60);
}
