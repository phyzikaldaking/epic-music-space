"use client";

import { useMemo, useState } from "react";

type TrackKind = "audio" | "aux" | "master";
type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  volume: number;
  pan: number;
};

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e"];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeTrack(kind: TrackKind, index: number): Track {
  return {
    id: uid("track"),
    kind,
    name: kind === "audio" ? `Audio ${index + 1}` : kind === "aux" ? `Aux ${index + 1}` : "Master",
    muted: false,
    solo: false,
    armed: kind === "audio" && index === 0,
    volume: kind === "master" ? 85 : 78,
    pan: 0,
  };
}

export default function StudioControlFixPanel() {
  const [tracks, setTracks] = useState<Track[]>([makeTrack("audio", 0), makeTrack("audio", 1), makeTrack("master", 2)]);
  const [zoom, setZoom] = useState(180);
  const [waveHeight, setWaveHeight] = useState(72);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aiMix, setAiMix] = useState("Balanced mix assistant ready.");

  const soloActive = tracks.some((track) => track.solo);
  const visibleTracks = useMemo(() => tracks.filter((track) => !track.muted && (!soloActive || track.solo)), [tracks, soloActive]);

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track));
  }

  function armTrack(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.kind === "audio" && track.id === id })));
  }

  function createTrack(kind: TrackKind) {
    if (kind === "master" && tracks.some((track) => track.kind === "master")) return;
    setTracks((current) => [...current, makeTrack(kind, current.length)]);
  }

  function deleteTrack(id: string) {
    setTracks((current) => current.filter((track) => track.id !== id));
  }

  function runAiMix() {
    const audio = tracks.filter((track) => track.kind === "audio");
    const next = audio.map((track, index) => ({
      ...track,
      volume: Math.max(58, Math.min(88, 82 - index * 4)),
      pan: audio.length > 1 ? Math.round(((index / Math.max(1, audio.length - 1)) * 80) - 40) : 0,
      muted: false,
    }));
    setTracks((current) => current.map((track) => next.find((item) => item.id === track.id) ?? track));
    setAiMix("AI Mix applied: leveled audio tracks, opened panning, cleared mute on audio tracks, and preserved master fader.");
  }

  return (
    <main className="h-full overflow-auto bg-[#111316] px-3 pb-24 pt-4 text-white sm:px-5 sm:pt-6 md:h-dvh md:pb-8 md:pt-16">
      <section className="mx-auto max-w-6xl border border-white/10 bg-[#171b22] p-3 shadow-[0_24px_80px_rgba(0,0,0,.45)] sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:flex-wrap sm:items-center">
          <h1 className="font-display text-2xl font-black uppercase tracking-[0.1em] text-cyan-100 sm:mr-auto sm:text-3xl sm:tracking-[0.12em]">Studio Controls</h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button onClick={() => createTrack("audio")} className="min-h-11 bg-cyan-300 px-3 py-2 text-xs font-black uppercase text-black sm:px-4">Add Audio</button>
            <button onClick={() => createTrack("aux")} className="min-h-11 bg-[#30343b] px-3 py-2 text-xs font-black uppercase text-white/75 sm:px-4">Add Aux</button>
            <button onClick={() => createTrack("master")} className="min-h-11 bg-[#d8d2bd] px-3 py-2 text-xs font-black uppercase text-black sm:px-4">Add Master</button>
            <button onClick={() => setPlaying((value) => !value)} className={playing ? "min-h-11 bg-red-500 px-3 py-2 text-xs font-black uppercase text-black sm:px-5" : "min-h-11 bg-green-400 px-3 py-2 text-xs font-black uppercase text-black sm:px-5"}>{playing ? "Stop" : "Play"}</button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[260px_1fr_260px]">
          <aside className="border border-black bg-[#252930]">
            <div className="border-b border-black bg-[#30343b] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55">Track Controls</div>
            <div className="max-h-[46svh] overflow-auto xl:max-h-none">
              {tracks.map((track, index) => (
                <div key={track.id} className="grid grid-cols-[8px_1fr] border-b border-black bg-[#282c33]">
                  <span style={{ backgroundColor: colors[index % colors.length] }} />
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <input value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="min-h-10 min-w-0 flex-1 bg-black px-2 py-1 text-xs font-bold uppercase text-white outline-none" />
                      <button onClick={() => deleteTrack(track.id)} className="min-h-10 bg-red-500 px-3 py-1 text-[9px] font-black uppercase text-black">Del</button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase">
                      <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={track.muted ? "min-h-10 bg-yellow-300 py-2 text-black" : "min-h-10 bg-black py-2 text-white/55"}>Mute</button>
                      <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={track.solo ? "min-h-10 bg-cyan-300 py-2 text-black" : "min-h-10 bg-black py-2 text-white/55"}>Solo</button>
                      <button disabled={track.kind !== "audio"} onClick={() => armTrack(track.id)} className={track.armed ? "min-h-10 bg-red-500 py-2 text-black" : "min-h-10 bg-black py-2 text-white/55 disabled:opacity-30"}>Rec</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="min-w-0 border border-black bg-[#1b1f26]">
            <div className="flex flex-col gap-3 border-b border-black bg-[#30343b] p-3 text-xs font-black uppercase tracking-widest text-white/60 sm:flex-row sm:flex-wrap sm:items-center">
              <span>Transport {playing ? "running" : "stopped"}</span>
              <input type="range" min="0" max="120" step="0.01" value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-full accent-cyan-300 sm:min-w-[220px] sm:flex-1" />
              <span className="font-mono text-green-300">{playhead.toFixed(2)}s</span>
            </div>
            <div className="border-b border-black bg-black p-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45">Timeline zoom {zoom}px/sec</label>
              <input type="range" min="10" max="2400" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-full accent-cyan-300" />
              <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] font-black uppercase sm:flex sm:flex-wrap">
                <button onClick={() => setZoom((z) => Math.max(10, z / 2))} className="min-h-10 bg-[#30343b] px-2 py-2 sm:px-3">Zoom Out</button>
                <button onClick={() => setZoom((z) => Math.min(2400, z * 2))} className="min-h-10 bg-[#30343b] px-2 py-2 sm:px-3">Zoom In</button>
                <button onClick={() => setZoom(180)} className="min-h-10 bg-[#30343b] px-2 py-2 sm:px-3">Reset</button>
              </div>
            </div>
            <div className="border-b border-black bg-black p-3">
              <label className="block text-[10px] font-black uppercase tracking-widest text-white/45">Wave height {waveHeight}px</label>
              <input type="range" min="20" max="220" value={waveHeight} onChange={(event) => setWaveHeight(Number(event.target.value))} className="w-full accent-yellow-300" />
            </div>
            <div className="max-h-[54svh] overflow-auto overscroll-contain xl:max-h-[70svh]">
              <div className="relative" style={{ width: Math.max(620, zoom * 20) }}>
                <div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_14px_#67e8f9]" style={{ left: playhead * zoom }} />
                {visibleTracks.map((track, index) => (
                  <div key={track.id} className="relative border-b border-black" style={{ height: waveHeight + 28 }}>
                    <div className="absolute left-0 top-0 h-full w-full bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.08)_0,rgba(255,255,255,.08)_1px,transparent_1px,transparent_80px)]" />
                    <div className="absolute left-2 top-2 max-w-28 truncate text-[10px] font-black uppercase tracking-widest text-white/45 sm:left-3 sm:max-w-none">{track.name}</div>
                    <div className="absolute left-28 right-4 top-6 rounded border border-cyan-300/35 bg-cyan-300/10 sm:left-32 sm:right-8" style={{ height: waveHeight }}>
                      {Array.from({ length: 90 }, (_, bar) => (
                        <span key={bar} className="absolute bottom-1/2 w-[2px] translate-y-1/2 bg-cyan-200" style={{ left: `${bar * 1.1}%`, height: `${Math.max(8, Math.sin((bar + index) * 0.7) * waveHeight * 0.38 + waveHeight * 0.45)}px` }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="border border-black bg-[#20242b] p-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-cyan-100">AI Mix</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">{aiMix}</p>
            <button onClick={runAiMix} className="mt-4 min-h-11 w-full bg-pink-300 px-4 py-3 text-xs font-black uppercase text-black">Run AI Mix</button>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {tracks.map((track) => (
                <label key={track.id} className="block text-[10px] font-black uppercase tracking-widest text-white/45">
                  {track.name} volume {track.volume}
                  <input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} className="w-full accent-[#d8d2bd]" />
                </label>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
