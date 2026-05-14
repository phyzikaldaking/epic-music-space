"use client";

import { memo, useMemo, useState } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type TakeRegion = {
  id: string;
  takeId: string;
  startBeat: number;
  endBeat: number;
  active: boolean;
};

type VocalTake = {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  regions: TakeRegion[];
};

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
};

const INITIAL_TAKES: VocalTake[] = [
  { id: "take-1", name: "Take 01 - Main", color: "#ff34df", muted: false, solo: false, regions: [{ id: "r1", takeId: "take-1", startBeat: 1, endBeat: 9, active: true }] },
  { id: "take-2", name: "Take 02 - Energy", color: "#17fff4", muted: false, solo: false, regions: [{ id: "r2", takeId: "take-2", startBeat: 9, endBeat: 17, active: true }] },
  { id: "take-3", name: "Take 03 - Clean", color: "#f6d63d", muted: false, solo: false, regions: [{ id: "r3", takeId: "take-3", startBeat: 17, endBeat: 25, active: true }] },
];

function TakeCompingPanel({ tracks, selectedTrack }: Props) {
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [tracks, selectedTrack]);
  const [takes, setTakes] = useState(INITIAL_TAKES);
  const [swipeStart, setSwipeStart] = useState<{ takeId: string; beat: number } | null>(null);
  const [auditionTake, setAuditionTake] = useState<string | null>("take-1");
  const beatWidth = 34;
  const totalBeats = 40;

  function toggleSolo(takeId: string) {
    setAuditionTake(takeId);
    setTakes((current) => current.map((take) => ({ ...take, solo: take.id === takeId, muted: false })));
  }

  function toggleMute(takeId: string) {
    setTakes((current) => current.map((take) => take.id === takeId ? { ...take, muted: !take.muted, solo: false } : take));
  }

  function setCompRegion(takeId: string, startBeat: number, endBeat: number) {
    const start = Math.max(1, Math.min(startBeat, endBeat));
    const end = Math.min(totalBeats, Math.max(startBeat, endBeat));
    setTakes((current) => current.map((take) => ({
      ...take,
      regions: [
        ...take.regions.map((region) => region.startBeat < end && region.endBeat > start ? { ...region, active: false } : region),
        ...(take.id === takeId ? [{ id: `region-${Date.now()}`, takeId, startBeat: start, endBeat: Math.max(start + 1, end), active: true }] : []),
      ],
    })));
  }

  function beatFromPointer(clientX: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return Math.max(1, Math.min(totalBeats, Math.round((clientX - rect.left - 150) / beatWidth) + 1));
  }

  return (
    <section className="min-h-[560px] overflow-auto rounded-xl border border-pink-300/20 bg-black/45 p-3">
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/85 p-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">Take Comping</p>
          <h2 className="text-lg font-black uppercase" style={{ color: selected?.color }}>Vocal comp for {selected?.name ?? "track"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTakes((current) => [...current, { id: `take-${Date.now()}`, name: `Take ${String(current.length + 1).padStart(2, "0")}`, color: selected?.color ?? "#ff34df", muted: false, solo: false, regions: [] }])} className="rounded-lg border border-green-300/25 px-3 py-2 text-xs font-black uppercase text-green-100">Add Take</button>
          <button onClick={() => setTakes((current) => current.map((take) => ({ ...take, solo: false, muted: false })))} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-white/55">Clear Audition</button>
        </div>
      </div>

      <div className="min-w-[1540px] rounded-xl border border-white/10 bg-[#071015]">
        <div className="grid h-9 border-b border-white/10 bg-black/80" style={{ gridTemplateColumns: `150px repeat(${totalBeats}, ${beatWidth}px)` }}>
          <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/35">Take</div>
          {Array.from({ length: totalBeats }, (_, index) => index + 1).map((beat) => (
            <div key={beat} className={`border-l px-1 py-2 text-[9px] ${beat % 4 === 1 ? "border-pink-300/25 text-pink-100/70" : "border-white/5 text-white/25"}`}>{beat % 4 === 1 ? beat : ""}</div>
          ))}
        </div>

        {takes.map((take, index) => (
          <div key={take.id} className="grid h-[74px] border-b border-white/10" style={{ gridTemplateColumns: `150px ${totalBeats * beatWidth}px` }}>
            <div className="sticky left-0 z-10 border-r border-white/10 bg-black/85 p-2">
              <p className="truncate text-[11px] font-black uppercase" style={{ color: take.color }}>{take.name}</p>
              <div className="mt-2 flex gap-1">
                <button onClick={() => toggleSolo(take.id)} className={`rounded border px-2 py-1 text-[9px] font-black ${take.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 text-white/45"}`}>SOLO</button>
                <button onClick={() => toggleMute(take.id)} className={`rounded border px-2 py-1 text-[9px] font-black ${take.muted ? "border-red-300 bg-red-300/20 text-red-100" : "border-white/10 text-white/45"}`}>MUTE</button>
              </div>
            </div>
            <div
              className={`relative overflow-hidden ${auditionTake === take.id ? "bg-white/[.05]" : "bg-black/20"}`}
              onPointerDown={(event) => setSwipeStart({ takeId: take.id, beat: beatFromPointer(event.clientX, event.currentTarget) })}
              onPointerUp={(event) => {
                if (!swipeStart) return;
                const endBeat = beatFromPointer(event.clientX, event.currentTarget);
                setCompRegion(swipeStart.takeId, swipeStart.beat, endBeat);
                setSwipeStart(null);
              }}
            >
              <div className="absolute inset-2 opacity-55"><StudioWaveform color={take.color} row={index + 1} /></div>
              {take.regions.filter((region) => region.active).map((region) => (
                <button key={region.id} onClick={() => setCompRegion(take.id, region.startBeat, region.endBeat)} className="absolute top-3 h-12 rounded-lg border text-left text-[9px] font-black uppercase shadow-lg" style={{ left: (region.startBeat - 1) * beatWidth, width: Math.max(34, (region.endBeat - region.startBeat) * beatWidth), borderColor: take.color, background: `${take.color}28`, color: take.color }}>
                  <span className="block truncate px-2">COMP {region.startBeat}-{region.endBeat}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Comp Assembly</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {takes.flatMap((take) => take.regions.filter((region) => region.active).map((region) => (
            <span key={region.id} className="rounded-full border px-3 py-1 text-[10px] font-black uppercase" style={{ borderColor: take.color, color: take.color }}>{take.name}: {region.startBeat}-{region.endBeat}</span>
          )))}
        </div>
      </div>
      <p className="mt-3 text-xs text-white/40">Swipe across any take lane to create an active comp phrase. Solo auditions one take at a time; active regions build the final vocal comp.</p>
    </section>
  );
}

export default memo(TakeCompingPanel);
