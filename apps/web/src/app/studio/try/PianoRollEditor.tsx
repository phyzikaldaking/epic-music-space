"use client";

import { memo, useMemo, useState } from "react";
import type { MidiNoteEvent } from "./studioAudioEngine";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
};

const SCALE_NOTES = new Set([0, 2, 3, 5, 7, 8, 10]);
const INITIAL_NOTES: MidiNoteEvent[] = [
  { id: "n1", note: 48, velocity: 0.85, start: 0, duration: 1 },
  { id: "n2", note: 51, velocity: 0.72, start: 1, duration: 1 },
  { id: "n3", note: 55, velocity: 0.9, start: 2, duration: 2 },
  { id: "n4", note: 58, velocity: 0.66, start: 5, duration: 1 },
];

function quantize(value: number, grid: number) {
  return Math.max(0, Math.round(value / grid) * grid);
}

function snapToMinor(note: number) {
  let current = note;
  while (!SCALE_NOTES.has(current % 12)) current -= 1;
  return current;
}

function PianoRollEditor({ tracks, selectedTrack }: Props) {
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [tracks, selectedTrack]);
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [grid, setGrid] = useState(0.25);
  const [scaleSnap, setScaleSnap] = useState(true);
  const [selectedNote, setSelectedNote] = useState<string | null>("n1");
  const beatWidth = 52;
  const rowHeight = 18;
  const minNote = 36;
  const maxNote = 72;
  const beats = 32;
  const height = (maxNote - minNote + 1) * rowHeight;

  function moveNote(id: string, deltaBeat: number, deltaNote: number) {
    setNotes((current) => current.map((note) => {
      if (note.id !== id) return note;
      const nextNote = scaleSnap ? snapToMinor(note.note + deltaNote) : note.note + deltaNote;
      return { ...note, start: quantize(note.start + deltaBeat, grid), note: Math.max(minNote, Math.min(maxNote, nextNote)) };
    }));
  }

  function resizeNote(id: string, delta: number) {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, duration: Math.max(grid, quantize(note.duration + delta, grid)) } : note));
  }

  function changeVelocity(id: string, delta: number) {
    setNotes((current) => current.map((note) => note.id === id ? { ...note, velocity: Math.max(0.05, Math.min(1, note.velocity + delta)) } : note));
  }

  return (
    <section className="min-h-[560px] overflow-auto rounded-xl border border-green-300/20 bg-black/45 p-3">
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/85 p-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Piano Roll</p>
          <h2 className="text-lg font-black uppercase" style={{ color: selected?.color }}>MIDI notes for {selected?.name ?? "track"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[0.25, 0.5, 1].map((item) => <button key={item} onClick={() => setGrid(item)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${grid === item ? "border-green-300 bg-green-300/20 text-green-100" : "border-white/10 text-white/45"}`}>Q {item}</button>)}
          <button onClick={() => setScaleSnap((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${scaleSnap ? "border-cyan-300 bg-cyan-300/20 text-cyan-100" : "border-white/10 text-white/45"}`}>Scale Snap</button>
          <button onClick={() => setNotes((current) => [...current, { id: `note-${Date.now()}`, note: 60, velocity: 0.75, start: 0, duration: 1 }])} className="rounded-lg border border-green-300/25 px-3 py-2 text-xs font-black uppercase text-green-100">Add Note</button>
        </div>
      </div>

      <div className="min-w-[1780px] rounded-xl border border-white/10 bg-[#071015]">
        <div className="relative" style={{ height, width: 110 + beats * beatWidth }}>
          {Array.from({ length: maxNote - minNote + 1 }, (_, index) => maxNote - index).map((note, row) => (
            <div key={note} className={`absolute left-0 right-0 border-b border-white/5 ${SCALE_NOTES.has(note % 12) ? "bg-white/[.025]" : "bg-black/20"}`} style={{ top: row * rowHeight, height: rowHeight }}>
              <div className="sticky left-0 z-10 inline-grid h-full w-[110px] place-items-center border-r border-white/10 bg-black/85 text-[9px] text-white/35">{note}</div>
            </div>
          ))}
          {Array.from({ length: beats + 1 }, (_, beat) => <div key={beat} className={`absolute top-0 h-full border-l ${beat % 4 === 0 ? "border-cyan-300/18" : "border-white/5"}`} style={{ left: 110 + beat * beatWidth }} />)}
          {notes.map((note) => {
            const top = (maxNote - note.note) * rowHeight + 2;
            const selectedNoteActive = selectedNote === note.id;
            return (
              <div key={note.id} className="absolute flex h-[14px] overflow-hidden rounded border" style={{ top, left: 110 + note.start * beatWidth, width: Math.max(34, note.duration * beatWidth), borderColor: selectedNoteActive ? "#fff" : selected?.color, background: `${selected?.color ?? "#22c55e"}35` }}>
                <button onClick={() => setSelectedNote(note.id)} className="min-w-0 flex-1 px-2 text-left text-[9px] font-black text-white/80">{note.note}</button>
                <button onClick={() => resizeNote(note.id, -grid)} className="w-5 border-l border-white/10 text-[9px] text-white/50">-</button>
                <button onClick={() => resizeNote(note.id, grid)} className="w-5 border-l border-white/10 text-[9px] text-white/50">+</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/35 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Selected note controls</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => selectedNote && moveNote(selectedNote, -grid, 0)} className="rounded border border-white/10 px-3 py-2 text-xs text-white/60">Left</button>
          <button onClick={() => selectedNote && moveNote(selectedNote, grid, 0)} className="rounded border border-white/10 px-3 py-2 text-xs text-white/60">Right</button>
          <button onClick={() => selectedNote && moveNote(selectedNote, 0, 1)} className="rounded border border-white/10 px-3 py-2 text-xs text-white/60">Up</button>
          <button onClick={() => selectedNote && moveNote(selectedNote, 0, -1)} className="rounded border border-white/10 px-3 py-2 text-xs text-white/60">Down</button>
          <button onClick={() => selectedNote && changeVelocity(selectedNote, 0.08)} className="rounded border border-yellow-300/20 px-3 py-2 text-xs text-yellow-100">Velocity +</button>
          <button onClick={() => selectedNote && changeVelocity(selectedNote, -0.08)} className="rounded border border-yellow-300/20 px-3 py-2 text-xs text-yellow-100">Velocity -</button>
        </div>
      </div>
    </section>
  );
}

export default memo(PianoRollEditor);
