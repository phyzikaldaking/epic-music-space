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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Meter({ value, color = "bg-green-400" }: { value: number; color?: string }) {
  return (
    <div className="h-24 w-3 rounded-full border border-black bg-black/70 p-[2px] shadow-inner">
      <div className="flex h-full items-end rounded-full bg-[#050607]">
        <span className={cn("block w-full rounded-full shadow-[0_0_12px_rgba(74,222,128,.6)]", color)} style={{ height: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export default function StudioControlFixPanel() {
  const [tracks, setTracks] = useState<Track[]>([makeTrack("audio", 0), makeTrack("audio", 1), makeTrack("master", 2)]);
  const [zoom, setZoom] = useState(180);
  const [waveHeight, setWaveHeight] = useState(76);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aiMix, setAiMix] = useState("Balanced mix assistant ready. It will level tracks, clear accidental mutes, and spread audio across the stereo field.");

  const soloActive = tracks.some((track) => track.solo);
  const visibleTracks = useMemo(() => tracks.filter((track) => !track.muted && (!soloActive || track.solo)), [tracks, soloActive]);
  const masterTrack = tracks.find((track) => track.kind === "master");
  const meterValue = playing ? 76 : 18;

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
    setAiMix("AI Mix applied: audio tracks leveled, panning opened, accidental mutes cleared, master preserved.");
  }

  return (
    <main className="h-full overflow-auto bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.13),transparent_32%),radial-gradient(circle_at_top_right,rgba(255,122,223,.1),transparent_34%),linear-gradient(180deg,#080a0d,#111316_42%,#090b0f)] px-3 pb-24 pt-4 text-white sm:px-5 sm:pt-6 md:h-dvh md:pb-8 md:pt-16">
      <section className="mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#11151b]/95 shadow-[0_26px_90px_rgba(0,0,0,.65),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur">
        <header className="border-b border-black bg-[linear-gradient(180deg,#2c3139,#171b21)] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
            <div className="mr-auto">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">Epic Music Space</p>
              <h1 className="mt-1 font-display text-2xl font-black uppercase tracking-[0.14em] text-white sm:text-3xl">Studio Console</h1>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button onClick={() => createTrack("audio")} className="min-h-11 rounded-xl border border-cyan-200/25 bg-cyan-300 px-4 py-2 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(34,211,238,.22)]">Audio</button>
              <button onClick={() => createTrack("aux")} className="min-h-11 rounded-xl border border-white/10 bg-[#343a44] px-4 py-2 text-xs font-black uppercase tracking-widest text-white/80 hover:bg-[#424a56]">Aux</button>
              <button onClick={() => createTrack("master")} className="min-h-11 rounded-xl border border-[#d8d2bd]/35 bg-[#d8d2bd] px-4 py-2 text-xs font-black uppercase tracking-widest text-black">Master</button>
              <button onClick={() => setPlaying((value) => !value)} className={cn("min-h-11 rounded-xl px-5 py-2 text-xs font-black uppercase tracking-widest text-black shadow-lg", playing ? "bg-red-500 shadow-red-500/20" : "bg-green-400 shadow-green-400/20")}>{playing ? "Stop" : "Play"}</button>
            </div>
          </div>
        </header>

        <section className="grid gap-px bg-black xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="bg-[#1b2028]">
            <div className="border-b border-black bg-[#252b34] px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Track List</div>
            <div className="max-h-[46svh] overflow-auto xl:max-h-[calc(100dvh-15rem)]">
              {tracks.map((track, index) => (
                <article key={track.id} className="border-b border-black bg-[linear-gradient(180deg,#252a33,#1a1f27)] p-3">
                  <div className="flex items-center gap-3">
                    <span className="h-12 w-2 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: colors[index % colors.length], color: colors[index % colors.length] }} />
                    <div className="min-w-0 flex-1">
                      <input value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="min-h-10 w-full rounded-lg border border-white/10 bg-black/55 px-3 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-cyan-300" />
                      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-white/35">{track.kind} channel · pan {track.pan}</p>
                    </div>
                    <button onClick={() => deleteTrack(track.id)} className="min-h-10 rounded-lg bg-red-500/90 px-3 text-[9px] font-black uppercase text-black hover:bg-red-400">Del</button>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest">
                    <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={cn("min-h-10 rounded-lg border", track.muted ? "border-yellow-200 bg-yellow-300 text-black" : "border-white/10 bg-black/55 text-white/55 hover:text-white")}>Mute</button>
                    <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={cn("min-h-10 rounded-lg border", track.solo ? "border-cyan-200 bg-cyan-300 text-black" : "border-white/10 bg-black/55 text-white/55 hover:text-white")}>Solo</button>
                    <button disabled={track.kind !== "audio"} onClick={() => armTrack(track.id)} className={cn("min-h-10 rounded-lg border disabled:opacity-35", track.armed ? "border-red-200 bg-red-500 text-black" : "border-white/10 bg-black/55 text-white/55 hover:text-white")}>Rec</button>
                  </div>
                </article>
              ))}
            </div>
          </aside>

          <section className="min-w-0 bg-[#10141a]">
            <div className="border-b border-black bg-[linear-gradient(180deg,#222833,#11151b)] p-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                    <span>Transport Deck</span>
                    <span className="font-mono text-green-300">{playhead.toFixed(2)}s</span>
                  </div>
                  <input type="range" min="0" max="120" step="0.01" value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-full accent-cyan-300" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-widest sm:flex">
                  <button onClick={() => setPlayhead(0)} className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-white/60 hover:text-white">Return</button>
                  <button onClick={() => setPlaying(false)} className="rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-white/60 hover:text-white">Stop</button>
                  <button onClick={() => setPlaying(true)} className="rounded-lg bg-green-400 px-4 py-3 text-black">Play</button>
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-black sm:grid-cols-2">
              <div className="bg-[#090b0f] p-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Timeline zoom {zoom}px/sec</label>
                <input type="range" min="10" max="2400" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-2 w-full accent-cyan-300" />
                <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest">
                  <button onClick={() => setZoom((z) => Math.max(10, z / 2))} className="min-h-10 rounded-lg bg-[#303743] px-2 py-2 text-white/75">Out</button>
                  <button onClick={() => setZoom((z) => Math.min(2400, z * 2))} className="min-h-10 rounded-lg bg-[#303743] px-2 py-2 text-white/75">In</button>
                  <button onClick={() => setZoom(180)} className="min-h-10 rounded-lg bg-[#303743] px-2 py-2 text-white/75">Reset</button>
                </div>
              </div>
              <div className="bg-[#090b0f] p-3">
                <label className="block text-[10px] font-black uppercase tracking-[0.22em] text-white/45">Wave height {waveHeight}px</label>
                <input type="range" min="20" max="220" value={waveHeight} onChange={(event) => setWaveHeight(Number(event.target.value))} className="mt-2 w-full accent-yellow-300" />
                <p className="mt-3 text-[10px] uppercase tracking-widest text-white/35">Scale the visible waveform without changing audio timing.</p>
              </div>
            </div>

            <div className="max-h-[58svh] overflow-auto overscroll-contain bg-[#0c1016] xl:max-h-[calc(100dvh-22rem)]">
              <div className="relative" style={{ width: Math.max(680, zoom * 20) }}>
                <div className="absolute bottom-0 top-0 z-20 w-px bg-cyan-200 shadow-[0_0_18px_#67e8f9]" style={{ left: playhead * zoom }} />
                {visibleTracks.length === 0 && <div className="grid h-44 place-items-center text-sm font-bold uppercase tracking-widest text-white/35">No audible tracks. Clear mute or solo state.</div>}
                {visibleTracks.map((track, index) => (
                  <div key={track.id} className="relative border-b border-black bg-[linear-gradient(180deg,#151a22,#0e1218)]" style={{ height: waveHeight + 34 }}>
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.08)_0,rgba(255,255,255,.08)_1px,transparent_1px,transparent_80px)]" />
                    <div className="absolute left-2 top-2 z-10 max-w-28 truncate rounded bg-black/65 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white/55 sm:left-3 sm:max-w-none">{track.name}</div>
                    <div className="absolute left-28 right-4 top-7 overflow-hidden rounded-xl border bg-black/35 shadow-inner sm:left-36 sm:right-8" style={{ height: waveHeight, borderColor: colors[index % colors.length] }}>
                      {Array.from({ length: 120 }, (_, bar) => (
                        <span key={bar} className="absolute bottom-1/2 w-[2px] translate-y-1/2 rounded-full" style={{ left: `${bar * 0.85}%`, height: `${Math.max(8, Math.sin((bar + index) * 0.7) * waveHeight * 0.38 + waveHeight * 0.45)}px`, backgroundColor: colors[index % colors.length], boxShadow: `0 0 10px ${colors[index % colors.length]}66` }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="bg-[#161b22]">
            <div className="border-b border-black bg-[#252b34] px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Mix Rack</div>
            <div className="space-y-4 p-4">
              <section className="rounded-2xl border border-pink-300/15 bg-[linear-gradient(180deg,rgba(255,122,223,.12),rgba(0,0,0,.28))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
                <div className="flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-pink-300 text-lg font-black text-black">AI</div>
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-pink-100">AI Mix</h2>
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Level · pan · clean</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/62">{aiMix}</p>
                <button onClick={runAiMix} className="mt-4 min-h-11 w-full rounded-xl bg-pink-300 px-4 py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_0_22px_rgba(255,122,223,.22)]">Run AI Mix</button>
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#d8d2bd]">Master</h2>
                    <p className="text-[10px] uppercase tracking-widest text-white/35">Control room out</p>
                  </div>
                  <Meter value={masterTrack?.volume ?? meterValue} color={(masterTrack?.volume ?? 0) > 88 ? "bg-red-500" : "bg-green-400"} />
                </div>
                {masterTrack ? (
                  <label className="block text-[10px] font-black uppercase tracking-widest text-white/45">
                    Master fader {masterTrack.volume}
                    <input type="range" min="0" max="100" value={masterTrack.volume} onChange={(event) => updateTrack(masterTrack.id, { volume: Number(event.target.value) })} className="mt-2 w-full accent-[#d8d2bd]" />
                  </label>
                ) : (
                  <button onClick={() => createTrack("master")} className="w-full rounded-xl bg-[#d8d2bd] px-4 py-3 text-xs font-black uppercase tracking-widest text-black">Create Master</button>
                )}
              </section>

              <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">Channel Faders</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
                  {tracks.map((track, index) => (
                    <label key={track.id} className="rounded-xl border border-white/10 bg-[#151a21] p-3 text-[10px] font-black uppercase tracking-widest text-white/45">
                      <span className="block truncate" style={{ color: colors[index % colors.length] }}>{track.name}</span>
                      <input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} className="mt-3 w-full accent-cyan-300" />
                      <span className="mt-1 block font-mono text-white/70">{track.volume}</span>
                    </label>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
