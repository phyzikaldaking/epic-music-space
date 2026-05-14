"use client";

import { memo, useEffect, useMemo, useState } from "react";
import type { StudioArrangement, StudioClip } from "./studioDawTypes";
import type { StudioTrack } from "./studioWorkstationTypes";

const DEFAULT_CLIPS: StudioClip[] = [
  { id: "intro-drums", trackId: "drums", name: "Intro Drums", startBeat: 1, lengthBeats: 16, color: "#17fff4", type: "beat" },
  { id: "verse-bass", trackId: "bass", name: "Verse 808", startBeat: 9, lengthBeats: 32, color: "#f6d63d", type: "midi" },
  { id: "hook-lead", trackId: "lead", name: "Hook Lead", startBeat: 33, lengthBeats: 16, color: "#ff34df", type: "audio" },
];

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  bar: number;
  onSelectTrack: (trackId: string) => void;
};

function snap(value: number, snapBeats: number) {
  return Math.max(1, Math.round(value / snapBeats) * snapBeats);
}

function ArrangerTimelinePanel({ tracks, selectedTrack, bar, onSelectTrack }: Props) {
  const [arrangement, setArrangement] = useState<StudioArrangement>({ clips: DEFAULT_CLIPS, zoom: 18, snapBeats: 1 });
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const [loopStart, setLoopStart] = useState(1);
  const [loopEnd, setLoopEnd] = useState(17);
  const beatWidth = arrangement.zoom;
  const totalBeats = 96;
  const laneHeight = 58;

  function duplicateSelected() {
    setArrangement((state) => {
      const selected = state.clips.filter((clip) => selectedClips.includes(clip.id));
      if (!selected.length) return state;
      const clones = selected.map((clip) => ({ ...clip, id: `${clip.id}-${Date.now()}`, name: `${clip.name} Copy`, startBeat: clip.startBeat + clip.lengthBeats }));
      return { ...state, clips: [...state.clips, ...clones] };
    });
  }

  function resizeClip(clipId: string, delta: number) {
    setArrangement((state) => ({
      ...state,
      clips: state.clips.map((clip) => clip.id === clipId ? { ...clip, lengthBeats: Math.max(state.snapBeats, snap(clip.lengthBeats + delta, state.snapBeats)) } : clip),
    }));
  }

  function rippleDelete() {
    setArrangement((state) => {
      const removed = state.clips.filter((clip) => selectedClips.includes(clip.id));
      if (!removed.length) return state;
      const earliest = Math.min(...removed.map((clip) => clip.startBeat));
      const longest = Math.max(...removed.map((clip) => clip.lengthBeats));
      return {
        ...state,
        clips: state.clips
          .filter((clip) => !selectedClips.includes(clip.id))
          .map((clip) => clip.startBeat > earliest ? { ...clip, startBeat: Math.max(1, clip.startBeat - longest) } : clip),
      };
    });
    setSelectedClips([]);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelected();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedClips.length) {
        event.preventDefault();
        rippleDelete();
      }
      if (event.key.toLowerCase() === "l") {
        setLoopStart(Math.max(1, bar));
        setLoopEnd(Math.max(bar + 4, loopEnd));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedClips, bar, loopEnd]);

  return (
    <section className="min-h-[680px] overflow-auto overscroll-contain rounded-xl border border-cyan-300/20 bg-black/45 p-3 pr-2">
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/85 p-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Arranger Timeline</p>
          <h2 className="text-lg font-black uppercase">Clips, lanes, snapping</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={duplicateSelected} className="rounded-lg border border-green-300/25 px-3 py-2 text-xs font-black uppercase text-green-100">Duplicate</button>
          <button onClick={rippleDelete} className="rounded-lg border border-red-300/25 px-3 py-2 text-xs font-black uppercase text-red-100">Ripple Delete</button>
          <button onClick={() => setLoopStart(Math.max(1, bar))} className="rounded-lg border border-yellow-300/25 px-3 py-2 text-xs font-black uppercase text-yellow-100">Loop In</button>
          <button onClick={() => setLoopEnd(Math.max(loopStart + 1, bar))} className="rounded-lg border border-yellow-300/25 px-3 py-2 text-xs font-black uppercase text-yellow-100">Loop Out</button>
          <button onClick={() => setArrangement((state) => ({ ...state, zoom: Math.max(10, state.zoom - 2) }))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-white/60">Zoom -</button>
          <button onClick={() => setArrangement((state) => ({ ...state, zoom: Math.min(34, state.zoom + 2) }))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-white/60">Zoom +</button>
          <button onClick={() => setArrangement((state) => ({ ...state, snapBeats: state.snapBeats === 1 ? 4 : 1 }))} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs font-black uppercase text-cyan-100">Snap {arrangement.snapBeats}</button>
        </div>
      </div>

      <div className="min-w-[1180px] rounded-xl border border-white/10 bg-[#071015]">
        <div className="sticky top-[64px] z-10 grid h-9 border-b border-white/10 bg-black/80" style={{ gridTemplateColumns: `150px repeat(${totalBeats}, ${beatWidth}px)` }}>
          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/35">Track</div>
          {Array.from({ length: totalBeats }, (_, index) => index + 1).map((beat) => (
            <div key={beat} className={`border-l px-1 py-2 text-[9px] ${beat % 4 === 1 ? "border-cyan-300/25 text-cyan-100/70" : "border-white/5 text-white/25"}`}>{beat % 4 === 1 ? beat : ""}</div>
          ))}
        </div>

        <div className="relative" style={{ minHeight: tracks.length * laneHeight }}>
          <div className="pointer-events-none absolute top-0 z-10 h-full bg-yellow-300/10 ring-1 ring-yellow-300/25" style={{ left: 150 + (loopStart - 1) * beatWidth, width: Math.max(beatWidth, (loopEnd - loopStart) * beatWidth) }} />
          <div className="pointer-events-none absolute top-0 z-20 h-full w-[2px] bg-white/70" style={{ left: 150 + (Math.max(1, bar) - 1) * beatWidth }} />
          {tracks.map((track, row) => (
            <div key={track.id} className={`relative grid border-b border-white/10 ${selectedTrack === track.id ? "bg-cyan-300/[.06]" : row % 2 ? "bg-white/[.025]" : "bg-transparent"}`} style={{ gridTemplateColumns: `150px ${totalBeats * beatWidth}px`, height: laneHeight }} onClick={() => onSelectTrack(track.id)}>
              <div className="sticky left-0 z-10 border-r border-white/10 bg-black/80 px-3 py-3">
                <p className="truncate text-xs font-black uppercase" style={{ color: track.color }}>{track.name}</p>
                <p className="text-[10px] uppercase text-white/35">{track.kind}</p>
              </div>
              <div className="relative" style={{ backgroundImage: `linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px)`, backgroundSize: `${beatWidth * 4}px 100%` }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!draggingClip) return; const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const nextStart = snap(x / beatWidth + 1, arrangement.snapBeats); setArrangement((state) => ({ ...state, clips: state.clips.map((item) => item.id === draggingClip ? { ...item, trackId: track.id, startBeat: nextStart } : item) })); }}>
                {arrangement.clips.filter((clip) => clip.trackId === track.id).map((clip) => {
                  const selected = selectedClips.includes(clip.id);
                  return (
                    <div key={clip.id} draggable onDragStart={() => setDraggingClip(clip.id)} onDragEnd={() => setDraggingClip(null)} className="absolute top-2 flex h-10 overflow-hidden rounded-lg border shadow-lg" style={{ left: (clip.startBeat - 1) * beatWidth, width: Math.max(64, clip.lengthBeats * beatWidth - 6), borderColor: selected ? "#fff" : clip.color, background: `${clip.color}24`, color: clip.color }}>
                      <button onClick={(event) => { event.stopPropagation(); setSelectedClips((current) => event.shiftKey ? (current.includes(clip.id) ? current.filter((id) => id !== clip.id) : [...current, clip.id]) : [clip.id]); }} className="min-w-0 flex-1 px-3 text-left text-[10px] font-black uppercase">
                        <span className="block truncate">{clip.name}</span>
                        <span className="block text-[9px] text-white/45">{clip.startBeat}-{clip.startBeat + clip.lengthBeats}</span>
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); resizeClip(clip.id, -arrangement.snapBeats); }} className="w-6 border-l border-white/10 text-white/50">-</button>
                      <button onClick={(event) => { event.stopPropagation(); resizeClip(clip.id, arrangement.snapBeats); }} className="w-6 border-l border-white/10 text-white/50">+</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-white/40">Shift-click multi-select. Cmd/Ctrl+D duplicates clips. Delete performs ripple delete. L sets loop-in at the current playhead.</p>
    </section>
  );
}

export default memo(ArrangerTimelinePanel);
