"use client";

import { useEffect, useMemo, useState } from "react";
import type { PatternBank, TrackState } from "./dawEngine";

export type ArrangementClip = {
  id: string;
  bank: PatternBank;
  startBar: number;
  lengthBars: number;
};

type SongSection = {
  id: string;
  label: string;
  startBar: number;
  lengthBars: number;
  color: string;
};

const BANKS: PatternBank[] = ["A", "B", "C", "D"];
const BANK_COLORS: Record<PatternBank, string> = {
  A: "#22d3ee",
  B: "#a78bfa",
  C: "#f59e0b",
  D: "#34d399",
};
const STORAGE_KEY = "ems.song-arrangement.v1";
const DEFAULT_SECTIONS: SongSection[] = [
  { id: "intro", label: "Intro", startBar: 1, lengthBars: 8, color: "#22d3ee" },
  { id: "verse-1", label: "Verse 1", startBar: 9, lengthBars: 16, color: "#a78bfa" },
  { id: "hook-1", label: "Hook", startBar: 25, lengthBars: 8, color: "#f59e0b" },
  { id: "verse-2", label: "Verse 2", startBar: 33, lengthBars: 16, color: "#a78bfa" },
  { id: "hook-2", label: "Hook", startBar: 49, lengthBars: 8, color: "#f59e0b" },
  { id: "outro", label: "Outro", startBar: 57, lengthBars: 8, color: "#34d399" },
];

function makeId() {
  return `arr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadClips(): ArrangementClip[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((clip) => BANKS.includes(clip?.bank) && clip?.startBar > 0 && clip?.lengthBars > 0)
      : [];
  } catch {
    return [];
  }
}

export default function SongArrangement({
  tracks,
  currentBar,
  playing,
  activeBank,
  onActivateBank,
  onOpenBeatMachine,
  onPrintBeatToStudio,
  onOpenMixRoom,
}: {
  tracks: TrackState[];
  currentBar: number;
  playing: boolean;
  activeBank: PatternBank;
  onActivateBank: (bank: PatternBank) => void;
  onOpenBeatMachine: () => void;
  onPrintBeatToStudio: (clips: ArrangementClip[]) => void | Promise<void>;
  onOpenMixRoom: () => void;
}) {
  const [clips, setClips] = useState<ArrangementClip[]>(loadClips);
  const [selectedBank, setSelectedBank] = useState<PatternBank>(activeBank);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [songBars, setSongBars] = useState(64);
  const barWidth = 30;
  const controlWidth = 150;
  const timelineWidth = songBars * barWidth;
  const selectedClip = clips.find((clip) => clip.id === selectedClipId) ?? null;
  const audioTracks = useMemo(() => tracks.filter((track) => track.hasAudio), [tracks]);

  function commit(next: ArrangementClip[]) {
    const sorted = [...next].sort((a, b) => a.startBar - b.startBar);
    setClips(sorted);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
  }

  function placeClip(startBar: number) {
    const snapped = Math.max(1, Math.min(songBars - 3, Math.floor((startBar - 1) / 4) * 4 + 1));
    const clip = { id: makeId(), bank: selectedBank, startBar: snapped, lengthBars: 4 };
    commit([...clips, clip]);
    setSelectedClipId(clip.id);
  }

  function updateSelected(patch: Partial<ArrangementClip>) {
    if (!selectedClip) return;
    commit(clips.map((clip) => clip.id === selectedClip.id ? { ...clip, ...patch } : clip));
  }

  function duplicateSelected() {
    if (!selectedClip) return;
    const copy = { ...selectedClip, id: makeId(), startBar: Math.min(songBars, selectedClip.startBar + selectedClip.lengthBars) };
    commit([...clips, copy]);
    setSelectedClipId(copy.id);
  }

  function deleteSelected() {
    if (!selectedClip) return;
    commit(clips.filter((clip) => clip.id !== selectedClip.id));
    setSelectedClipId(null);
  }

  function buildStarterSong() {
    const next: ArrangementClip[] = [
      { id: makeId(), bank: "A", startBar: 1, lengthBars: 8 },
      { id: makeId(), bank: "B", startBar: 9, lengthBars: 16 },
      { id: makeId(), bank: "C", startBar: 25, lengthBars: 8 },
      { id: makeId(), bank: "B", startBar: 33, lengthBars: 16 },
      { id: makeId(), bank: "C", startBar: 49, lengthBars: 8 },
      { id: makeId(), bank: "D", startBar: 57, lengthBars: 8 },
    ];
    commit(next);
    setSongBars(64);
    setSelectedClipId(next[0]?.id ?? null);
  }

  function moveClip(clipId: string, startBar: number) {
    const snapped = Math.max(1, Math.min(songBars, Math.floor((startBar - 1) / 4) * 4 + 1));
    commit(clips.map((clip) => clip.id === clipId ? { ...clip, startBar: snapped } : clip));
    setSelectedClipId(clipId);
  }

  useEffect(() => {
    if (!playing) return;
    const clip = [...clips].reverse().find((item) => currentBar >= item.startBar && currentBar < item.startBar + item.lengthBars);
    if (clip && clip.bank !== activeBank) onActivateBank(clip.bank);
  }, [activeBank, clips, currentBar, onActivateBank, playing]);

  return (
    <section className="border-b border-white/10 bg-[#080c10]" aria-label="Song arrangement">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#111820] px-3 py-2">
        <div className="mr-2">
          <p className="text-[11px] font-black uppercase tracking-[.24em] text-cyan-100">Song Arrangement</p>
          <p className="text-[11px] text-white/45">Build the full record. The Beat Machine edits each pattern; this screen places those patterns across the song.</p>
        </div>
        {BANKS.map((bank) => (
          <button key={bank} type="button" onClick={() => setSelectedBank(bank)} className={`rounded border px-3 py-1.5 text-[11px] font-black uppercase ${selectedBank === bank ? "text-black" : "bg-black/30 text-white/65"}`} style={{ borderColor: BANK_COLORS[bank], backgroundColor: selectedBank === bank ? BANK_COLORS[bank] : undefined }}>Pattern {bank}</button>
        ))}
        <button type="button" onClick={onOpenBeatMachine} className="rounded border border-pink-300/40 bg-pink-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-pink-100">Edit Pattern {selectedBank}</button>
        <button type="button" onClick={() => void onPrintBeatToStudio(clips)} disabled={clips.length === 0} className="rounded border border-green-300/40 bg-green-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-green-100 disabled:cursor-not-allowed disabled:opacity-35">Print Song to Studio</button>
        <button type="button" onClick={onOpenMixRoom} className="rounded border border-purple-300/40 bg-purple-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-purple-100">Mix Room</button>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/50">
          <button type="button" onClick={duplicateSelected} disabled={!selectedClip} className="rounded border border-white/15 px-2 py-1 disabled:opacity-30">Duplicate</button>
          <button type="button" onClick={() => updateSelected({ lengthBars: Math.max(1, (selectedClip?.lengthBars ?? 4) - 4) })} disabled={!selectedClip} className="rounded border border-white/15 px-2 py-1 disabled:opacity-30">− 4 bars</button>
          <button type="button" onClick={() => updateSelected({ lengthBars: (selectedClip?.lengthBars ?? 0) + 4 })} disabled={!selectedClip} className="rounded border border-white/15 px-2 py-1 disabled:opacity-30">+ 4 bars</button>
          <button type="button" onClick={deleteSelected} disabled={!selectedClip} className="rounded border border-red-400/35 px-2 py-1 text-red-200 disabled:opacity-30">Delete</button>
          <button type="button" onClick={buildStarterSong} className="rounded border border-cyan-300/35 px-2 py-1 text-cyan-100">Build starter song</button>
          <label className="flex items-center gap-1">Song bars <select value={songBars} onChange={(event) => setSongBars(Number(event.target.value))} className="rounded border border-white/15 bg-black px-2 py-1 text-white"><option value={32}>32</option><option value={64}>64</option><option value={96}>96</option><option value={128}>128</option></select></label>
        </div>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <div style={{ width: controlWidth + timelineWidth, minWidth: "100%" }}>
          <div className="grid h-8 border-b border-white/10" style={{ gridTemplateColumns: `${controlWidth}px ${timelineWidth}px` }}>
            <div className="sticky left-0 z-30 border-r border-white/10 bg-[#111820] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/40">Sections</div>
            <div className="relative bg-[#0a0f14]">
              {DEFAULT_SECTIONS.filter((section) => section.startBar <= songBars).map((section) => <div key={section.id} className="absolute bottom-1 top-1 overflow-hidden rounded-sm border px-2 text-[9px] font-black uppercase leading-6 tracking-wider" style={{ left: (section.startBar - 1) * barWidth, width: Math.min(section.lengthBars, songBars - section.startBar + 1) * barWidth, borderColor: `${section.color}88`, color: section.color, backgroundColor: `${section.color}18` }}>{section.label}</div>)}
            </div>
          </div>

          <div className="grid h-8 border-b border-white/10" style={{ gridTemplateColumns: `${controlWidth}px ${timelineWidth}px` }}>
            <div className="sticky left-0 z-30 border-r border-white/10 bg-[#111820] px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/40">Bars</div>
            <div className="relative bg-black/45">
              {Array.from({ length: songBars }, (_, index) => index + 1).map((bar) => <span key={bar} className={`absolute top-0 h-full border-l px-1 pt-2 font-mono text-[8px] ${bar % 4 === 1 ? "border-cyan-200/25 text-cyan-100/70" : "border-white/5 text-white/25"}`} style={{ left: (bar - 1) * barWidth, width: barWidth }}>{bar}</span>)}
              <span className="absolute bottom-0 top-0 z-20 w-px bg-pink-400 shadow-[0_0_10px_rgba(244,114,182,.8)]" style={{ left: Math.max(0, (currentBar - 1) * barWidth) }} />
            </div>
          </div>

          <div className="grid min-h-20 border-b border-white/10" style={{ gridTemplateColumns: `${controlWidth}px ${timelineWidth}px` }}>
            <div className="sticky left-0 z-30 border-r border-white/10 bg-[#111820] px-3 py-3"><b className="block text-[11px] uppercase text-cyan-100">Beat Machine</b><span className="text-[9px] uppercase text-white/35">Pattern clips</span></div>
            <div role="button" tabIndex={0} aria-label={`Place pattern ${selectedBank} on arrangement`} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); placeClip(Math.floor((event.clientX - rect.left) / barWidth) + 1); }} onKeyDown={(event) => { if (event.key === "Enter") placeClip(1); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const clipId = event.dataTransfer.getData("text/ems-arrangement-clip"); if (!clipId) return; const rect = event.currentTarget.getBoundingClientRect(); moveClip(clipId, Math.floor((event.clientX - rect.left) / barWidth) + 1); }} className="relative min-h-20 cursor-crosshair text-left" style={{ backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,.045) 0, rgba(255,255,255,.045) 1px, transparent 1px, transparent ${barWidth}px)` }}>
              {clips.map((clip) => <button type="button" draggable key={clip.id} onDragStart={(event) => { event.dataTransfer.setData("text/ems-arrangement-clip", clip.id); event.dataTransfer.effectAllowed = "move"; }} onClick={(event) => { event.stopPropagation(); setSelectedClipId(clip.id); setSelectedBank(clip.bank); }} className={`absolute bottom-2 top-2 cursor-grab overflow-hidden rounded border px-2 py-2 text-left text-[10px] font-black uppercase tracking-wider active:cursor-grabbing ${selectedClipId === clip.id ? "ring-2 ring-white" : ""}`} style={{ left: (clip.startBar - 1) * barWidth, width: clip.lengthBars * barWidth, borderColor: BANK_COLORS[clip.bank], color: BANK_COLORS[clip.bank], background: `linear-gradient(135deg, ${BANK_COLORS[clip.bank]}35, #050709 68%)` }}>Pattern {clip.bank}<small className="mt-1 block text-[8px] text-white/45">Bars {clip.startBar}–{clip.startBar + clip.lengthBars - 1} · drag to move</small></button>)}
            </div>
          </div>

          {audioTracks.map((track) => <div key={track.id} className="grid h-14 border-b border-white/5" style={{ gridTemplateColumns: `${controlWidth}px ${timelineWidth}px` }}><div className="sticky left-0 z-30 truncate border-r border-white/10 bg-[#111820] px-3 py-3 text-[10px] font-bold text-white/70"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: track.color }} />{track.name}</div><div className="relative bg-black/20" style={{ backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,.035) 0, rgba(255,255,255,.035) 1px, transparent 1px, transparent ${barWidth}px)` }}><div className="absolute bottom-2 left-0 top-2 rounded border border-white/15 px-2 py-2 text-[9px] font-black uppercase text-white/60" style={{ width: Math.max(barWidth, Math.min(timelineWidth, ((track.durationSec || 1) / (60 / 120 * 4)) * barWidth)), backgroundColor: `${track.color}20` }}>{track.name} audio</div></div></div>)}
        </div>
      </div>
    </section>
  );
}
