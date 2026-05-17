"use client";

import { useMemo, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type StudioMode = "edit" | "beat" | "mix" | "export";

type Track = {
  id: string;
  name: string;
  color: string;
  height: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  volume: number;
  clips: { id: string; start: number; width: number; label: string }[];
};

const initialTracks: Track[] = [
  { id: "vox", name: "Lead Vox", color: "#ff31df", height: 74, muted: false, solo: false, armed: true, volume: 78, clips: [{ id: "vox-1", start: 7, width: 18, label: "Lead_Vox_01" }, { id: "vox-2", start: 38, width: 21, label: "Hook_Double" }] },
  { id: "beat", name: "Beat Machine", color: "#20f7ff", height: 70, muted: false, solo: false, armed: false, volume: 82, clips: [{ id: "beat-1", start: 0, width: 28, label: "EMS_Beat_A" }, { id: "beat-2", start: 31, width: 28, label: "EMS_Beat_B" }] },
  { id: "bass", name: "808 Bass", color: "#f2c85b", height: 62, muted: false, solo: false, armed: false, volume: 76, clips: [{ id: "bass-1", start: 0, width: 22, label: "808_Sub" }, { id: "bass-2", start: 34, width: 18, label: "808_Fill" }] },
  { id: "keys", name: "Keys", color: "#16e59a", height: 62, muted: false, solo: false, armed: false, volume: 64, clips: [{ id: "keys-1", start: 14, width: 34, label: "Keys_Chords" }] },
  { id: "fx", name: "FX / Risers", color: "#a75cff", height: 54, muted: false, solo: false, armed: false, volume: 48, clips: [{ id: "fx-1", start: 54, width: 11, label: "Riser" }] },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function NavButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] transition",
        active ? "border-cyan-300 bg-cyan-300 text-black shadow-[0_0_24px_rgba(32,247,255,.38)]" : "border-white/12 bg-white/[0.04] text-white/62 hover:border-cyan-300/50 hover:text-cyan-100",
      )}
    >
      {children}
    </button>
  );
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<StudioMode>("edit");
  const [tracks, setTracks] = useState(initialTracks);
  const [selectedTrack, setSelectedTrack] = useState("vox");
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const selected = tracks.find((track) => track.id === selectedTrack) ?? tracks[0];

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#05070a] text-white">
      <div className="flex h-full flex-col gap-2 p-2">
        <header className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-[#11161c]/95 p-2 shadow-[0_0_30px_rgba(0,0,0,.35)]">
          <button onClick={() => setMode("edit")} className="rounded-xl border border-white/12 bg-black/35 px-4 py-2 text-left">
            <span className="block text-xl font-black tracking-tight text-cyan-300">EMS Studio</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pro edit + beat machine</span>
          </button>
          <nav className="flex flex-wrap gap-2">
            <NavButton active={mode === "edit"} onClick={() => setMode("edit")}>Edit</NavButton>
            <NavButton active={mode === "beat"} onClick={() => setMode("beat")}>Beat Machine</NavButton>
            <NavButton active={mode === "mix"} onClick={() => setMode("mix")}>Mix</NavButton>
            <NavButton active={mode === "export"} onClick={() => setMode("export")}>Export</NavButton>
          </nav>
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
            <button onClick={() => setPlaying(!playing)} className={cn("rounded-full px-4 py-2 text-[11px] font-black uppercase", playing ? "bg-red-400 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
            <label className="text-[10px] uppercase text-white/45">BPM <input value={bpm} onChange={(event) => setBpm(Number(event.target.value) || 92)} className="ml-2 w-16 rounded bg-black px-2 py-1 text-cyan-200 outline-none" /></label>
            <button onClick={() => setMode("beat")} className="rounded-full border border-cyan-300/45 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase text-cyan-100">Open Beat Machine</button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/12 bg-[#090d11]">
          {mode === "beat" && <BeatMachineProClient studioMode />}
          {mode === "edit" && <ProToolsEdit tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={setSelectedTrack} updateTrack={updateTrack} playing={playing} bpm={bpm} openBeatMachine={() => setMode("beat")} />}
          {mode === "mix" && <MixView tracks={tracks} selected={selected} updateTrack={updateTrack} />}
          {mode === "export" && <ExportView tracks={tracks} />}
        </main>
      </div>
    </div>
  );
}

function ProToolsEdit({ tracks, selectedTrack, setSelectedTrack, updateTrack, playing, bpm, openBeatMachine }: { tracks: Track[]; selectedTrack: string; setSelectedTrack: (id: string) => void; updateTrack: (id: string, patch: Partial<Track>) => void; playing: boolean; bpm: number; openBeatMachine: () => void }) {
  const bars = useMemo(() => Array.from({ length: 17 }, (_, i) => i + 1), []);
  return (
    <div className="grid h-full min-h-0 grid-rows-[44px_1fr] overflow-hidden bg-[#101418]">
      <div className="grid grid-cols-[230px_1fr_300px] border-b border-white/10 bg-[#151a20] text-[10px] font-black uppercase tracking-[0.14em] text-white/52">
        <div className="flex items-center gap-2 border-r border-white/10 px-3"><span className={cn("h-2 w-2 rounded-full", playing ? "bg-green-400" : "bg-white/25")} /> Edit Window</div>
        <div className="flex items-center overflow-hidden px-2">{bars.map((bar) => <span key={bar} className="min-w-[90px] border-l border-white/10 px-2 font-mono text-white/40">{bar}</span>)}</div>
        <div className="flex items-center justify-end gap-2 border-l border-white/10 px-3"><span>{bpm} BPM</span><button onClick={openBeatMachine} className="rounded-full border border-cyan-300/45 bg-cyan-300/10 px-3 py-1 text-cyan-100">Beat Machine</button></div>
      </div>
      <div className="grid min-h-0 grid-cols-[230px_1fr_300px] overflow-hidden">
        <aside className="overflow-auto border-r border-white/10 bg-[#11161b]">
          {tracks.map((track) => (
            <button key={track.id} onClick={() => setSelectedTrack(track.id)} className={cn("flex w-full items-center gap-2 border-b border-white/8 p-3 text-left", selectedTrack === track.id && "bg-cyan-300/10")} style={{ height: track.height }}>
              <span className="h-8 w-1 rounded" style={{ backgroundColor: track.color }} />
              <span className="min-w-0 flex-1"><b className="block truncate text-xs uppercase text-white/82">{track.name}</b><span className="text-[10px] uppercase text-white/35">Vol {track.volume}</span></span>
              <span className="flex gap-1">
                <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.muted ? "bg-yellow-300 text-black" : "bg-white/8 text-white/40")}>M</span>
                <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.solo ? "bg-cyan-300 text-black" : "bg-white/8 text-white/40")}>S</span>
                <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.armed ? "bg-red-400 text-black" : "bg-white/8 text-white/40")}>R</span>
              </span>
            </button>
          ))}
        </aside>
        <section className="relative overflow-auto bg-[#0d1116] bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px)] bg-[size:100%_54px,90px_100%]">
          <div className="absolute left-[360px] top-0 h-full w-px bg-cyan-300 shadow-[0_0_16px_#20f7ff]" />
          <div className="min-w-[1530px]">
            {tracks.map((track, row) => (
              <div key={track.id} className="relative border-b border-white/8" style={{ height: track.height }}>
                {track.clips.map((clip) => (
                  <button key={clip.id} className="absolute top-2 h-[calc(100%-16px)] rounded-lg border px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.18)]" style={{ left: `${clip.start * 9}px`, width: `${clip.width * 9}px`, borderColor: track.color, backgroundColor: `${track.color}22` }}>
                    <b className="block truncate text-[11px] uppercase" style={{ color: track.color }}>{clip.label}</b>
                    <WaveMini color={track.color} row={row} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
        <Inspector tracks={tracks} selectedTrack={selectedTrack} updateTrack={updateTrack} />
      </div>
    </div>
  );
}

function WaveMini({ color, row }: { color: string; row: number }) {
  return <div className="mt-2 flex h-7 items-center gap-[2px] overflow-hidden">{Array.from({ length: 40 }, (_, i) => <span key={i} className="w-1 rounded-full" style={{ height: `${6 + Math.abs(Math.sin(i * 0.55 + row)) * 20}px`, backgroundColor: color, opacity: 0.78 }} />)}</div>;
}

function Inspector({ tracks, selectedTrack, updateTrack }: { tracks: Track[]; selectedTrack: string; updateTrack: (id: string, patch: Partial<Track>) => void }) {
  const track = tracks.find((item) => item.id === selectedTrack) ?? tracks[0];
  return (
    <aside className="overflow-auto border-l border-white/10 bg-[#11161b] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Inspector</p>
      <h2 className="mt-2 text-2xl font-black uppercase" style={{ color: track.color }}>{track.name}</h2>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={cn("rounded-lg border py-2 text-xs font-black", track.muted ? "border-yellow-300 bg-yellow-300 text-black" : "border-white/10 text-white/55")}>Mute</button>
        <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={cn("rounded-lg border py-2 text-xs font-black", track.solo ? "border-cyan-300 bg-cyan-300 text-black" : "border-white/10 text-white/55")}>Solo</button>
        <button onClick={() => updateTrack(track.id, { armed: !track.armed })} className={cn("rounded-lg border py-2 text-xs font-black", track.armed ? "border-red-400 bg-red-400 text-black" : "border-white/10 text-white/55")}>Arm</button>
      </div>
      <label className="mt-5 block text-[10px] font-black uppercase text-white/45">Volume<input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="mt-2 w-full accent-cyan-300" /></label>
      <label className="mt-4 block text-[10px] font-black uppercase text-white/45">Track Height<input type="range" min="44" max="120" value={track.height} onChange={(e) => updateTrack(track.id, { height: Number(e.target.value) })} className="mt-2 w-full accent-pink-300" /></label>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-white/55">This Edit window now behaves like a focused DAW edit surface: track list left, timeline center, inspector right, no bulky banners.</div>
    </aside>
  );
}

function MixView({ tracks, selected, updateTrack }: { tracks: Track[]; selected: Track; updateTrack: (id: string, patch: Partial<Track>) => void }) {
  return <div className="h-full overflow-auto p-4"><div className="grid min-w-[900px] grid-cols-5 gap-3">{tracks.map((track) => <div key={track.id} className="rounded-2xl border border-white/10 bg-black/35 p-4"><b className="block text-center text-xs uppercase" style={{ color: track.color }}>{track.name}</b><div className="mt-5 flex h-72 items-end justify-center gap-3"><div className="relative h-full w-3 rounded bg-white/10"><span className="absolute bottom-0 left-0 right-0 rounded" style={{ height: `${track.volume}%`, backgroundColor: track.color }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="h-72 w-14 accent-cyan-300 [writing-mode:vertical-lr]" /></div></div>)}</div><p className="mt-4 text-xs uppercase text-white/35">Selected: {selected.name}</p></div>;
}

function ExportView({ tracks }: { tracks: Track[] }) {
  function exportJson() { const blob = new Blob([JSON.stringify({ tracks }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "ems-studio-session.json"; a.click(); URL.revokeObjectURL(url); }
  return <div className="grid h-full place-items-center p-6"><div className="max-w-xl rounded-2xl border border-white/12 bg-black/40 p-6 text-center"><h2 className="text-3xl font-black uppercase text-cyan-200">Export Session</h2><p className="mt-3 text-sm text-white/55">Export real session state from this Studio view.</p><button onClick={exportJson} className="mt-5 rounded-full bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">Download Session JSON</button></div></div>;
}
