"use client";

import { memo, useMemo, useState } from "react";
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
  const [draggingClip, setDraggingClip] = useState<string | null>(null);
  const beatWidth = arrangement.zoom;
  const totalBeats = 96;
  const laneHeight = 58;
  const trackById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks]);

  return (
    <section className="min-h-[680px] overflow-auto overscroll-contain rounded-xl border border-cyan-300/20 bg-black/45 p-3 pr-2">
      <div className="sticky top-0 z-20 mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/85 p-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Arranger Timeline</p>
          <h2 className="text-lg font-black uppercase">Clips, lanes, snapping</h2>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="pointer-events-none absolute top-0 z-10 h-full w-[2px] bg-white/70" style={{ left: 150 + (Math.max(1, bar) - 1) * beatWidth }} />
          {tracks.map((track, row) => (
            <div key={track.id} className={`relative grid border-b border-white/10 ${selectedTrack === track.id ? "bg-cyan-300/[.06]" : row % 2 ? "bg-white/[.025]" : "bg-transparent"}`} style={{ gridTemplateColumns: `150px ${totalBeats * beatWidth}px`, height: laneHeight }} onClick={() => onSelectTrack(track.id)}>
              <div className="sticky left-0 z-10 border-r border-white/10 bg-black/80 px-3 py-3">
                <p className="truncate text-xs font-black uppercase" style={{ color: track.color }}>{track.name}</p>
                <p className="text-[10px] uppercase text-white/35">{track.kind}</p>
              </div>
              <div className="relative" style={{ backgroundImage: `linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px)`, backgroundSize: `${beatWidth * 4}px 100%` }}>
                {arrangement.clips.filter((clip) => clip.trackId === track.id).map((clip) => (
                  <button
                    key={clip.id}
                    draggable
                    onDragStart={() => setDraggingClip(clip.id)}
                    onDragEnd={() => setDraggingClip(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggingClip) return;
                      const rect = event.currentTarget.parentElement?.getBoundingClientRect();
                      const x = rect ? event.clientX - rect.left : 0;
                      const nextStart = snap(x / beatWidth + 1, arrangement.snapBeats);
                      setArrangement((state) => ({ ...state, clips: state.clips.map((item) => item.id === draggingClip ? { ...item, trackId: track.id, startBeat: nextStart } : item) }));
                    }}
                    className="absolute top-2 h-10 rounded-lg border px-3 text-left text-[10px] font-black uppercase shadow-lg"
                    style={{ left: (clip.startBeat - 1) * beatWidth, width: Math.max(48, clip.lengthBeats * beatWidth - 6), borderColor: clip.color, background: `${clip.color}24`, color: clip.color }}
                  >
                    <span className="block truncate">{clip.name}</span>
                    <span className="block text-[9px] text-white/45">{clip.startBeat}-{clip.startBeat + clip.lengthBeats}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-white/40">Drag clips across lanes. Zoom and snap are local UI state for now, ready to persist through project storage and CRDT operations.</p>
    </section>
  );
}

export default memo(ArrangerTimelinePanel);
