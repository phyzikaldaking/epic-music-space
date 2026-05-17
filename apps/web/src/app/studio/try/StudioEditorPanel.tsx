"use client";

import { memo, useMemo, useState } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack, StudioTrackKind } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  addTrack: (kind?: StudioTrackKind) => void;
};

type EditTool = "selector" | "trim" | "grabber" | "smart" | "scrub" | "pencil";

const EDIT_TOOLS: { id: EditTool; label: string; icon: string }[] = [
  { id: "selector", label: "Selector", icon: "I" },
  { id: "trim", label: "Trim", icon: "↔" },
  { id: "grabber", label: "Grabber", icon: "✋" },
  { id: "smart", label: "Smart", icon: "⚡" },
  { id: "scrub", label: "Scrub", icon: "◁" },
  { id: "pencil", label: "Pencil", icon: "✎" },
];

const QUALITY_CHECKLIST = [
  "Low-latency monitoring path",
  "Real decoded waveforms, no fake regions",
  "Clip gain before inserts",
  "Per-track EQ and high-pass filters",
  "Transient shaping for drums",
  "808/kick tuning and phase check",
  "De-click fades on every clip edge",
  "Noise gate / silence cleanup",
  "Auto-gain staging before mix bus",
  "Stereo width only above sub range",
  "Metering: peak, RMS, LUFS, crest factor",
  "Saturation/soft clipping for perceived loudness",
  "Limiter safety on master preview",
  "Reference-track A/B switch",
  "Stem export with headroom",
  "Cloud-saved session snapshots",
];

const RULER_MARKS = Array.from({ length: 33 }, (_, index) => index);
const TRACK_WIDTH = 1600;

function StudioEditorPanel({ tracks, selectedTrack, setSelectedTrack, addTrack }: Props) {
  const [tool, setTool] = useState<EditTool>("smart");
  const [grid, setGrid] = useState("1/16");
  const [snap, setSnap] = useState(true);
  const [qualityOpen, setQualityOpen] = useState(true);
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [selectedTrack, tracks]);

  return (
    <section className="min-h-[calc(100dvh-190px)] overflow-visible rounded-xl border border-cyan-300/20 bg-[#060b10] text-white shadow-[0_0_34px_rgba(0,245,255,.10)]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090f15]/95 p-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto min-w-[220px]">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200/70">Pro edit window</p>
            <h2 className="text-xl font-black uppercase tracking-wider">Studio Editor / Timeline</h2>
          </div>
          <div className="flex rounded-xl border border-white/10 bg-black/55 p-1">
            {EDIT_TOOLS.map((item) => (
              <button key={item.id} title={item.label} onClick={() => setTool(item.id)} className={`grid h-9 w-10 place-items-center rounded-lg text-xs font-black ${tool === item.id ? "bg-cyan-300 text-black" : "text-white/55 hover:text-white"}`}>{item.icon}</button>
            ))}
          </div>
          <select value={grid} onChange={(event) => setGrid(event.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs font-black uppercase text-cyan-100">
            <option>Bar</option>
            <option>1/4</option>
            <option>1/8</option>
            <option>1/16</option>
            <option>1/32</option>
          </select>
          <button onClick={() => setSnap(!snap)} className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${snap ? "border-green-300 bg-green-300/10 text-green-100" : "border-white/10 text-white/45"}`}>Snap {snap ? "On" : "Off"}</button>
          <button onClick={() => addTrack("audio")} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">+ Audio</button>
          <button onClick={() => addTrack("vocal")} className="rounded-xl border border-pink-300/35 bg-pink-300/10 px-3 py-2 text-xs font-black uppercase text-pink-100">+ Vocal</button>
          <button onClick={() => addTrack("midi")} className="rounded-xl border border-green-300/35 bg-green-300/10 px-3 py-2 text-xs font-black uppercase text-green-100">+ MIDI</button>
          <button onClick={() => setQualityOpen(!qualityOpen)} className="rounded-xl border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-xs font-black uppercase text-yellow-100">Quality</button>
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-260px)] grid-cols-[245px_minmax(0,1fr)] overflow-visible">
        <aside className="border-r border-white/10 bg-[#091017]">
          <div className="sticky top-[64px] z-20 border-b border-white/10 bg-black/45 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">Track list</p>
            <div className="mt-2 rounded-xl border border-white/10 bg-white/[.03] p-2">
              <b className="block truncate text-sm uppercase" style={{ color: selected?.color ?? "#17fff4" }}>{selected?.name ?? "No track"}</b>
              <span className="text-[10px] uppercase text-white/45">Tool {tool} · Grid {grid}</span>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {tracks.map((track) => (
              <button key={track.id} onClick={() => setSelectedTrack(track.id)} className={`block w-full p-3 text-left transition ${selectedTrack === track.id ? "bg-cyan-300/10" : "hover:bg-white/[.035]"}`}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: track.color }} />
                  <b className="min-w-0 flex-1 truncate text-xs uppercase" style={{ color: track.color }}>{track.name}</b>
                  <span className="text-[9px] uppercase text-white/35">{track.kind}</span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1 text-[9px] font-black uppercase">
                  <span className={`rounded border px-1 py-1 text-center ${track.armed ? "border-red-300 bg-red-300/20 text-red-100" : "border-white/10 text-white/35"}`}>R</span>
                  <span className={`rounded border px-1 py-1 text-center ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 text-white/35"}`}>S</span>
                  <span className={`rounded border px-1 py-1 text-center ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 text-white/35"}`}>M</span>
                  <span className="rounded border border-white/10 px-1 py-1 text-center text-white/35">{track.volume}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, track.meter ?? 0))}%`, background: track.color }} /></div>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-w-0 overflow-x-auto overflow-y-visible bg-[#05080c]">
          <div className="min-w-[1600px]">
            <div className="sticky top-[64px] z-20 border-b border-white/10 bg-[#080d12]/95 backdrop-blur">
              <div className="relative h-14" style={{ width: TRACK_WIDTH }}>
                {RULER_MARKS.map((mark) => (
                  <div key={mark} className="absolute top-0 h-full border-l border-white/10" style={{ left: `${(mark / (RULER_MARKS.length - 1)) * 100}%` }}>
                    <span className="ml-1 text-[10px] font-black uppercase text-white/45">{mark + 1}</span>
                  </div>
                ))}
                <div className="absolute bottom-0 left-0 right-0 h-5 bg-cyan-300/5 text-[9px] uppercase tracking-widest text-cyan-100/60">Bars / Beats / Timeline ruler</div>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px)", backgroundSize: snap ? "50px 100%, 100% 86px" : "200px 100%, 100% 86px" }} />
              {tracks.map((track, row) => {
                const left = 54 + ((row * 137) % 420);
                const width = 260 + ((row * 73) % 340);
                return (
                  <div key={track.id} className={`relative h-[86px] border-b border-white/10 ${selectedTrack === track.id ? "bg-cyan-300/[.045]" : "bg-white/[.012]"}`} onClick={() => setSelectedTrack(track.id)}>
                    <div className="absolute left-0 top-0 h-full w-full" />
                    <div className="absolute top-3 h-[58px] rounded-lg border bg-black/70 shadow-[0_0_18px_rgba(0,0,0,.35)]" style={{ left, width, borderColor: `${track.color}88` }}>
                      <div className="flex h-5 items-center justify-between rounded-t-lg border-b border-white/10 px-2" style={{ background: `${track.color}22` }}>
                        <span className="truncate text-[10px] font-black uppercase" style={{ color: track.color }}>{track.name} region</span>
                        <span className="text-[9px] uppercase text-white/45">clip gain 0.0</span>
                      </div>
                      <div className="relative h-[37px] overflow-hidden rounded-b-lg bg-black/55">
                        <StudioWaveform color={track.color} row={row} waveform={track.waveform} emptyLabel="Drop or import audio" />
                        <div className="absolute inset-y-0 left-0 w-2 border-r border-white/20 bg-white/10" title="fade/trim handle" />
                        <div className="absolute inset-y-0 right-0 w-2 border-l border-white/20 bg-white/10" title="fade/trim handle" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {qualityOpen ? (
        <section className="border-t border-yellow-300/20 bg-[#100d05] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-yellow-200/70">Sound quality checklist</p>
              <h3 className="text-lg font-black uppercase">What makes the beat machine and studio sound better</h3>
            </div>
            <span className="rounded-full border border-yellow-300/30 px-3 py-1 text-[10px] font-black uppercase text-yellow-100">{QUALITY_CHECKLIST.length} upgrades</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {QUALITY_CHECKLIST.map((item, index) => (
              <div key={item} className="rounded-xl border border-yellow-300/15 bg-yellow-300/[.04] p-3">
                <span className="text-[10px] font-black uppercase text-yellow-100">{String(index + 1).padStart(2, "0")}</span>
                <p className="mt-1 text-xs font-bold leading-5 text-white/70">{item}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default memo(StudioEditorPanel);
