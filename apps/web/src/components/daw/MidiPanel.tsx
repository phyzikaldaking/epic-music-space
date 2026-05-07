"use client";

import { useEffect, useMemo } from "react";
import type { MidiSynthState, SynthWave } from "./dawEngine";

interface Props {
  state: MidiSynthState;
  /** Lo / hi MIDI note range for the on-screen keyboard. */
  noteLo?: number;
  noteHi?: number;
  onEnableMidi: () => void;
  onDisableMidi: () => void;
  onSetParam: <K extends keyof MidiSynthState>(key: K, value: MidiSynthState[K]) => void;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  onPanic: () => void;
  /** MIDI clip recording — toggles capture of played notes into a clip. */
  onStartClipRec: () => void;
  onStopClipRec: () => void;
  onClearClip: () => void;
}

const WAVES: SynthWave[] = ["sine", "triangle", "sawtooth", "square"];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Computer-keyboard → MIDI note map (one octave starting at C4). */
const KEY_TO_MIDI: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65,
  t: 66, g: 67, y: 68, h: 69, u: 70, j: 71,
  k: 72,
};

export default function MidiPanel({
  state,
  noteLo = 60,
  noteHi = 84,
  onEnableMidi,
  onDisableMidi,
  onSetParam,
  onNoteOn,
  onNoteOff,
  onPanic,
  onStartClipRec,
  onStopClipRec,
  onClearClip,
}: Props) {
  // Computer keyboard → synth. Listening on window because the panel
  // doesn't keep keyboard focus while you click sliders.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const note = KEY_TO_MIDI[e.key.toLowerCase()];
      if (note === undefined) return;
      onNoteOn(note, 0.8);
    }
    function up(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const note = KEY_TO_MIDI[e.key.toLowerCase()];
      if (note === undefined) return;
      onNoteOff(note);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onNoteOn, onNoteOff]);

  const keys = useMemo(() => {
    const out: { note: number; isBlack: boolean; label: string }[] = [];
    for (let n = noteLo; n <= noteHi; n++) {
      const name = NOTE_NAMES[n % 12]!;
      out.push({ note: n, isBlack: name.includes("#"), label: name });
    }
    return out;
  }, [noteLo, noteHi]);

  const whiteCount = keys.filter((k) => !k.isBlack).length;

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#0c0c14] via-[#10121c] to-[#0c0c14] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-violet-300/85">
            Synth · MIDI
          </p>
          <p className="mt-0.5 text-xs text-white/55">
            Polyphonic synth routed through the Synth track. Connect a MIDI
            keyboard or use your computer keys (A–K).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state.midiAvailable ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
              MIDI · {state.deviceNames.length || "no devices"}
            </span>
          ) : (
            <button
              type="button"
              onClick={onEnableMidi}
              className="rounded-lg border border-violet-500/45 bg-violet-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-violet-200 hover:bg-violet-500/25 transition"
            >
              Enable MIDI
            </button>
          )}
          {state.midiAvailable && (
            <button
              type="button"
              onClick={onDisableMidi}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10 transition"
            >
              Disable
            </button>
          )}
          <button
            type="button"
            onClick={state.recordingClip ? onStopClipRec : onStartClipRec}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition ${
              state.recordingClip
                ? "bg-red-500 text-white animate-pulse"
                : "border border-red-500/45 bg-red-500/10 text-red-200 hover:bg-red-500/20"
            }`}
            title={state.recordingClip ? "Stop clip recording" : "Record played notes into a clip"}
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />
            {state.recordingClip ? "Stop clip" : "Rec clip"}
          </button>
          {state.clip && (
            <button
              type="button"
              onClick={onClearClip}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10 transition"
              title="Delete the recorded MIDI clip"
            >
              Clear clip
            </button>
          )}
          <button
            type="button"
            onClick={onPanic}
            className="rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/20 transition"
            title="Silence all stuck notes"
          >
            Panic
          </button>
        </div>
      </header>

      {/* Voice controls */}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/55">
          Wave
          <select
            value={state.wave}
            onChange={(e) => onSetParam("wave", e.target.value as SynthWave)}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs font-mono text-white"
          >
            {WAVES.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <SynthSlider
          label="Attack"
          min={0.001}
          max={1}
          step={0.005}
          value={state.attackSec}
          suffix="s"
          onChange={(v) => onSetParam("attackSec", v)}
        />
        <SynthSlider
          label="Release"
          min={0.01}
          max={3}
          step={0.01}
          value={state.releaseSec}
          suffix="s"
          onChange={(v) => onSetParam("releaseSec", v)}
        />
        <SynthSlider
          label="Filter"
          min={200}
          max={12000}
          step={50}
          value={state.filterHz}
          suffix=" Hz"
          onChange={(v) => onSetParam("filterHz", v)}
        />
      </div>

      {/* Keyboard — white keys laid out as flex children, black keys
          absolutely positioned over the gaps. */}
      <div
        className="relative h-28 select-none overflow-hidden rounded-lg bg-black/40"
        style={{
          // CSS custom prop so we can size black keys relative to whites
          // without recomputing per-key.
          ["--white-count" as string]: whiteCount,
        }}
      >
        <div className="flex h-full">
          {keys
            .filter((k) => !k.isBlack)
            .map((k) => {
              const isActive = state.activeNotes.includes(k.note);
              return (
                <button
                  key={k.note}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onNoteOn(k.note, 0.85);
                  }}
                  onPointerUp={() => onNoteOff(k.note)}
                  onPointerLeave={() => onNoteOff(k.note)}
                  className="flex-1 border-r border-black/40 last:border-r-0 transition-colors"
                  style={{
                    background: isActive ? "#a78bfa" : "linear-gradient(180deg, #f3f4f6 0%, #d1d5db 100%)",
                  }}
                >
                  <span className="block h-full text-[8px] font-bold text-black/45">
                    {k.label === "C" && (
                      <span className="absolute bottom-1 ml-1 font-mono text-[9px]">{`${k.label}${Math.floor(k.note / 12) - 1}`}</span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>

        {/* Black keys layer */}
        {keys
          .filter((k) => k.isBlack)
          .map((k) => {
            // Find this black key's white-key neighbor index to position it.
            const whiteBefore = keys.filter(
              (other) => !other.isBlack && other.note < k.note,
            ).length;
            const isActive = state.activeNotes.includes(k.note);
            return (
              <button
                key={k.note}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onNoteOn(k.note, 0.85);
                }}
                onPointerUp={() => onNoteOff(k.note)}
                onPointerLeave={() => onNoteOff(k.note)}
                className="absolute top-0 h-[60%] w-[calc(100%/var(--white-count)*0.6)] rounded-b-md border border-black/60 transition-colors"
                style={{
                  left: `calc(${whiteBefore} * 100% / var(--white-count) - (100% / var(--white-count)) * 0.3)`,
                  background: isActive ? "#7c3aed" : "linear-gradient(180deg, #1f1f1f 0%, #050505 100%)",
                }}
                aria-label={`MIDI note ${k.note}`}
              />
            );
          })}
      </div>

      <p className="mt-2 text-[10px] text-white/35">
        Computer keys: A W S E D F T G Y H U J K → C4 to C5
      </p>
    </section>
  );
}

function SynthSlider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-white/55">
      <span>
        {label} <span className="font-mono normal-case text-white/65">{value.toFixed(suffix === " Hz" ? 0 : 3)}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-violet-500"
      />
    </label>
  );
}
