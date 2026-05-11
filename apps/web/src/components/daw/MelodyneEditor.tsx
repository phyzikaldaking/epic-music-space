"use client";

import { useEffect, useRef, useState } from "react";
import {
  extractPitchContour,
  segmentNotes,
  applyMelodyne,
  type MelodyneNote,
  type ScaleKey,
} from "@/lib/pitchCorrect";

// AI Melodyne — piano-roll-of-audio editor. The track buffer is fed
// in; we detect notes, render them as draggable rectangles on a
// vertical MIDI grid, and on Apply produce a corrected AudioBuffer
// that gets swapped back into the engine via onApply().

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// MIDI range we render (E2 to C6 — singer-friendly).
const MIDI_LOW = 40;
const MIDI_HIGH = 84;

// Cell sizes.
const ROW_HEIGHT = 14;
const PX_PER_SEC = 80;

type Props = {
  /** AudioBuffer to operate on. Component is a no-op while null. */
  buffer: AudioBuffer | null;
  /** Tonality target for the initial snap. User can override per note. */
  scaleKey?: ScaleKey;
  /** Audio context used to materialize the corrected buffer. */
  ctx: AudioContext | null;
  /** Apply handler — passes the corrected buffer back to the engine. */
  onApply: (corrected: AudioBuffer) => void;
  /** Cancel handler — close the editor without applying. */
  onClose: () => void;
};

function midiToName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${n}${octave}`;
}

export default function MelodyneEditor({
  buffer,
  scaleKey = "C",
  ctx,
  onApply,
  onClose,
}: Props) {
  const [notes, setNotes] = useState<MelodyneNote[]>([]);
  const [analyzing, setAnalyzing] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [amount, setAmount] = useState(1);
  const [key, setKey] = useState<ScaleKey>(scaleKey);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef<{ idx: number; startY: number; startMidi: number } | null>(null);

  // Run analysis when the buffer changes.
  useEffect(() => {
    if (!buffer) return;
    setAnalyzing(true);
    // Defer to the next tick so the modal can paint a spinner before
    // we block the main thread on autocorrelation.
    const id = window.setTimeout(() => {
      const contour = extractPitchContour(buffer);
      const detected = segmentNotes(contour, { key });
      setNotes(detected);
      setAnalyzing(false);
    }, 50);
    return () => window.clearTimeout(id);
  }, [buffer, key]);

  const sampleRate = buffer?.sampleRate ?? 48000;
  const durationSec = buffer ? buffer.length / sampleRate : 0;
  const gridWidth = Math.max(600, durationSec * PX_PER_SEC);
  const gridHeight = (MIDI_HIGH - MIDI_LOW + 1) * ROW_HEIGHT;

  function startDrag(e: React.PointerEvent, idx: number) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = {
      idx,
      startY: e.clientY,
      startMidi: notes[idx]?.targetMidi ?? 60,
    };
  }
  function onDrag(e: React.PointerEvent) {
    const drag = draggingRef.current;
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    // Up = higher note. Snap to whole semitones.
    const delta = -Math.round(dy / ROW_HEIGHT);
    setNotes((prev) =>
      prev.map((n, i) =>
        i === drag.idx
          ? {
              ...n,
              targetMidi: Math.max(
                MIDI_LOW,
                Math.min(MIDI_HIGH, drag.startMidi + delta),
              ),
            }
          : n,
      ),
    );
  }
  function endDrag(e: React.PointerEvent) {
    if (draggingRef.current) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {}
    }
    draggingRef.current = null;
  }

  function resetNote(idx: number) {
    setNotes((prev) =>
      prev.map((n, i) =>
        i === idx ? { ...n, targetMidi: n.detectedMidi } : n,
      ),
    );
  }
  function snapAllToKey() {
    // Re-segment using the current key (snap-on-pitch is what
    // `segmentNotes` does as the initial state).
    if (!buffer) return;
    const contour = extractPitchContour(buffer);
    setNotes(segmentNotes(contour, { key }));
  }

  async function apply() {
    if (!buffer || !ctx) return;
    setRendering(true);
    // Small delay so the spinner can render before we burn the main
    // thread on the resampler.
    await new Promise((r) => setTimeout(r, 30));
    const corrected = applyMelodyne(buffer, ctx, notes, { amount });
    setRendering(false);
    onApply(corrected);
  }

  if (!buffer) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-zinc-950 shadow-2xl shadow-cyan-500/10">
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-black/40 px-5 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">
              AI Melodyne · note-level pitch
            </p>
            <p className="text-sm font-bold text-white">
              {analyzing
                ? "Analyzing pitch contour…"
                : `${notes.length} notes detected · drag a block up/down to retune`}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-2">
              <span className="text-white/55">Key</span>
              <select
                value={key}
                onChange={(e) => setKey(e.target.value as ScaleKey)}
                className="rounded border border-white/15 bg-black/50 px-2 py-1"
              >
                {(
                  ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"] as ScaleKey[]
                ).map((k) => (
                  <option key={k} value={k}>
                    {k} major
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={snapAllToKey}
              className="rounded border border-white/15 bg-black/40 px-3 py-1 font-bold hover:bg-white/10"
            >
              Snap all → key
            </button>
            <label className="flex items-center gap-2">
              <span className="text-white/55">Strength</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(amount * 100)}
                onChange={(e) => setAmount(parseInt(e.target.value, 10) / 100)}
                className="w-28 accent-cyan-400"
              />
              <span className="w-8 tabular-nums text-white/70">
                {Math.round(amount * 100)}
              </span>
            </label>
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/15 bg-black/40 px-3 py-1 font-bold hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={analyzing || rendering}
              className="rounded bg-cyan-400 px-4 py-1.5 font-black uppercase tracking-widest text-black hover:bg-cyan-300 disabled:opacity-40"
            >
              {rendering ? "Rendering…" : "Apply"}
            </button>
          </div>
        </header>

        <div
          ref={containerRef}
          className="relative flex-1 overflow-auto bg-zinc-900"
        >
          {analyzing ? (
            <div className="grid h-full place-items-center p-12 text-sm text-white/55">
              Detecting pitch…
            </div>
          ) : (
            <div
              className="relative"
              style={{ width: gridWidth + 60, height: gridHeight }}
            >
              {/* Piano-roll key column on the left */}
              <div className="sticky left-0 z-10 inline-block w-[60px] bg-zinc-900">
                {Array.from({ length: MIDI_HIGH - MIDI_LOW + 1 }, (_, idx) => {
                  const midi = MIDI_HIGH - idx;
                  const isBlack = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
                  return (
                    <div
                      key={midi}
                      className={`flex items-center justify-end border-b border-white/[0.04] pr-2 text-[9px] ${
                        isBlack ? "bg-black/40 text-white/55" : "bg-zinc-800/40 text-white/75"
                      }`}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {midi % 12 === 0 ? midiToName(midi) : ""}
                    </div>
                  );
                })}
              </div>
              {/* Grid + note blocks */}
              <div
                className="absolute left-[60px] top-0"
                style={{ width: gridWidth, height: gridHeight }}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {/* Horizontal rows */}
                {Array.from({ length: MIDI_HIGH - MIDI_LOW + 1 }, (_, idx) => {
                  const midi = MIDI_HIGH - idx;
                  const isBlack = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
                  return (
                    <div
                      key={midi}
                      className={`absolute left-0 right-0 border-b border-white/[0.04] ${
                        isBlack ? "bg-black/30" : "bg-transparent"
                      }`}
                      style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                    />
                  );
                })}
                {/* Vertical second markers */}
                {Array.from({ length: Math.ceil(durationSec) + 1 }, (_, s) => (
                  <div
                    key={s}
                    className="absolute top-0 bottom-0 border-l border-white/[0.05]"
                    style={{ left: s * PX_PER_SEC }}
                  >
                    <span className="absolute left-1 top-0 text-[9px] text-white/35">
                      {s}s
                    </span>
                  </div>
                ))}
                {/* Notes */}
                {notes.map((n, idx) => {
                  const startSec = n.startSample / sampleRate;
                  const endSec = n.endSample / sampleRate;
                  const x = startSec * PX_PER_SEC;
                  const w = Math.max(6, (endSec - startSec) * PX_PER_SEC);
                  const targetTop = (MIDI_HIGH - n.targetMidi) * ROW_HEIGHT;
                  const detectedTop = (MIDI_HIGH - Math.round(n.detectedMidi)) * ROW_HEIGHT;
                  const shifted = n.targetMidi !== Math.round(n.detectedMidi);
                  return (
                    <div key={idx}>
                      {/* Ghost outline at detected pitch (so the singer
                          sees how far the note moved). */}
                      {shifted && (
                        <div
                          className="absolute rounded border border-dashed border-white/25"
                          style={{
                            left: x,
                            top: detectedTop,
                            width: w,
                            height: ROW_HEIGHT - 2,
                          }}
                        />
                      )}
                      {/* Editable block */}
                      <button
                        type="button"
                        onPointerDown={(e) => startDrag(e, idx)}
                        onDoubleClick={() => resetNote(idx)}
                        className={`absolute flex items-center justify-center rounded text-[9px] font-black uppercase tracking-widest shadow ${
                          shifted
                            ? "bg-cyan-400 text-black"
                            : "bg-cyan-500/30 text-cyan-100"
                        }`}
                        style={{
                          left: x,
                          top: targetTop,
                          width: w,
                          height: ROW_HEIGHT - 2,
                          opacity: Math.max(0.4, Math.min(1, 0.4 + n.rms * 6)),
                          cursor: "ns-resize",
                          touchAction: "none",
                        }}
                        title={`${midiToName(Math.round(n.detectedMidi))} → ${midiToName(n.targetMidi)} · double-click to reset`}
                      >
                        {midiToName(n.targetMidi)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-white/10 bg-black/40 px-5 py-2 text-[10px] uppercase tracking-widest text-white/50">
          Drag a note up/down to retune · Double-click to reset to detected pitch · Snap all aligns every note to the chosen key
        </footer>
      </div>
    </div>
  );
}
