"use client";

import { memo, useEffect, useMemo, useState } from "react";
import StudioMixerChannel from "./StudioMixerChannel";
import { useRafMeterBridge } from "./useRafMeterBridge";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  playing?: boolean;
  setSelectedTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
};

const MIX_TEMPLATE = [
  "Kick/808 centered and loudest foundation",
  "Snare/clap forward with clean midrange",
  "Hats/percussion widened but controlled",
  "Melody/keys carved for vocal pocket",
  "Vocals kept above beat elements",
  "FX/risers moved wider and lower",
  "Master protected with headroom",
];

function templateForTrack(track: StudioTrack, index: number) {
  const name = `${track.name} ${track.kind}`.toLowerCase();
  if (name.includes("master")) return { volume: 78, pan: 0, meter: 76 };
  if (name.includes("kick") || name.includes("drum")) return { volume: 84, pan: 0, meter: 86 };
  if (name.includes("808") || name.includes("bass")) return { volume: 76, pan: 0, meter: 72 };
  if (name.includes("snare") || name.includes("clap")) return { volume: 72, pan: 0, meter: 68 };
  if (name.includes("hat") || name.includes("perc")) return { volume: 56, pan: index % 2 ? 18 : -18, meter: 55 };
  if (name.includes("vocal") || name.includes("vox") || name.includes("lead")) return { volume: 82, pan: 0, meter: 80 };
  if (name.includes("fx")) return { volume: 48, pan: index % 2 ? 28 : -28, meter: 42 };
  if (name.includes("keys") || name.includes("melody") || name.includes("pad")) return { volume: 60, pan: index % 2 ? 14 : -14, meter: 54 };
  return { volume: 62, pan: index % 2 ? 8 : -8, meter: 52 };
}

function StudioMixerPanel({ tracks, selectedTrack, playing = false, setSelectedTrack, updateTrack }: Props) {
  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks]);
  const meters = useRafMeterBridge(trackIds);
  const [masterPeak, setMasterPeak] = useState(72);
  const [aiStatus, setAiStatus] = useState("AI Engineer ready. Press Auto Mix to build a starting mix template.");
  const buses = useMemo(() => [
    { name: "DRUM BUS", level: tracks.filter((track) => ["drum", "bass"].includes(track.kind)).length, color: "#17fff4" },
    { name: "MUSIC BUS", level: tracks.filter((track) => ["melody", "instrument", "midi"].includes(track.kind)).length, color: "#42ff56" },
    { name: "VOCAL BUS", level: tracks.filter((track) => track.kind === "vocal").length, color: "#ff34df" },
    { name: "FX BUS", level: tracks.filter((track) => track.kind === "fx").length, color: "#a855ff" },
    { name: "MASTER", level: tracks.length, color: "#f6d63d" },
  ], [tracks]);

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const now = performance.now();
      let total = 0;
      tracks.forEach((track, index) => {
        const wave = Math.sin(now / (playing ? 120 : 420) + index * 0.83) * 22;
        const bounce = Math.cos(now / (playing ? 180 : 620) + index * 1.41) * 14;
        const base = playing ? 48 : 18;
        const next = track.muted ? 4 : Math.max(8, Math.min(98, base + wave + bounce + ((index * 7 + frame) % 18)));
        total += next;
        meters.setMeterValue(track.id, next);
      });
      setMasterPeak(Math.max(12, Math.min(99, total / Math.max(1, tracks.length) + (playing ? Math.sin(now / 95) * 10 : 0))));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [meters, playing, tracks]);

  function autoMix() {
    tracks.forEach((track, index) => updateTrack(track.id, templateForTrack(track, index)));
    setAiStatus("AI Engineer applied a starter balance: drums/bass centered, music widened, vocals forward, master protected.");
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "AI Engineer Auto Mix applied." } }));
  }

  function resetSolosMutes() {
    tracks.forEach((track) => updateTrack(track.id, { muted: false, solo: false }));
    setAiStatus("Cleared mute/solo states across the board.");
  }

  return (
    <section data-testid="studio-live-mixer" className={`min-h-[720px] min-w-[1180px] overflow-visible rounded-xl border border-cyan-300/20 bg-[#05080b] p-2 ${playing ? "shadow-[0_0_48px_rgba(34,211,238,.18)]" : "shadow-[0_0_28px_rgba(255,255,255,.06)]"}`}>
      <header className="mb-2 rounded-xl border border-white/10 bg-black/65 px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">AI Engineer Mixer</p>
            <h2 className="text-2xl font-black uppercase tracking-wider text-white">Pro Tools Style Console</h2>
          </div>
          <button onClick={autoMix} className="rounded-xl border border-green-300/35 bg-green-300/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">One Button Auto Mix</button>
          <button onClick={resetSolosMutes} className="rounded-xl border border-white/10 bg-white/[.04] px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/60">Clear M/S</button>
          <span className={`h-3 w-3 rounded-full ${playing ? "animate-pulse bg-green-300 shadow-[0_0_18px_#86efac]" : "bg-white/20"}`} />
          <div className="h-10 w-44 overflow-hidden rounded-full border border-cyan-300/20 bg-black/60 p-1">
            <div className="h-full rounded-full bg-gradient-to-r from-green-300 via-yellow-300 to-pink-400 transition-[width] duration-75" style={{ width: `${masterPeak}%` }} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Master {Math.round(masterPeak)}%</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {buses.map((bus) => <div key={bus.name} className="rounded-lg border border-white/10 bg-white/[.035] p-2">
            <div className="flex items-center justify-between"><b className="text-[10px] uppercase" style={{ color: bus.color }}>{bus.name}</b><span className="text-[9px] text-white/35">{bus.level} ch</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.min(100, bus.level * 18)}%`, background: bus.color }} /></div>
          </div>)}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-green-300/15 bg-green-300/[.04] px-3 py-2 text-xs font-bold text-green-100/80">{aiStatus}</div>
          <div className="rounded-lg border border-yellow-300/15 bg-yellow-300/[.04] px-3 py-2 text-[10px] font-black uppercase leading-4 text-yellow-100/80">{MIX_TEMPLATE.join(" · ")}</div>
        </div>
      </header>
      <div className="ems-scroll min-h-[900px] overflow-x-auto pb-8 pr-8">
        <div className="flex min-w-max gap-2">
          {tracks.map((track, index) => (
            <StudioMixerChannel
              key={track.id}
              track={track}
              channelIndex={index + 1}
              selected={selectedTrack === track.id}
              playing={playing}
              bindMeter={meters.bindMeter}
              onSelect={() => setSelectedTrack(track.id)}
              onUpdate={(patch) => updateTrack(track.id, patch)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default memo(StudioMixerPanel);
