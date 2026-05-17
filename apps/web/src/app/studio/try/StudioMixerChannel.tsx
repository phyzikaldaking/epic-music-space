"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  track: StudioTrack;
  selected: boolean;
  playing?: boolean;
  channelIndex?: number;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioTrack>) => void;
  onAiMix?: () => void;
  bindMeter?: (trackId: string) => (element: HTMLDivElement | null) => void;
};

const INSERTS = ["EQ", "DYN", "SAT", "GTE"];
const SENDS = ["A", "B", "C"];

function busFor(track: StudioTrack) {
  if (["drum", "bass"].includes(track.kind)) return "DRM";
  if (["melody", "instrument", "midi"].includes(track.kind)) return "MUS";
  if (track.kind === "vocal") return "VOX";
  if (track.kind === "fx") return "FX";
  return track.name.toLowerCase().includes("master") ? "MST" : "AUX";
}

function StudioMixerChannel({ track, selected, playing = false, channelIndex = 1, onSelect, onUpdate, onAiMix, bindMeter }: Props) {
  const bus = busFor(track);
  const active = playing && !track.muted;

  return (
    <div
      onClick={onSelect}
      data-testid={`studio-mixer-channel-${track.id}`}
      className={`flex h-[780px] w-[126px] shrink-0 flex-col rounded-md border bg-gradient-to-b from-[#151b20] via-[#080c10] to-[#020304] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),inset_0_-18px_40px_rgba(0,0,0,.55)] transition ${selected ? "ring-1 ring-cyan-200/60" : ""}`}
      style={{ borderColor: selected ? track.color : "rgba(255,255,255,.12)" }}
    >
      <div className="rounded-sm border border-white/10 bg-[#05080a] px-1.5 py-1 shadow-[inset_0_0_14px_rgba(0,0,0,.85)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] font-black text-white/35">{String(channelIndex).padStart(2, "0")}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${active ? "animate-pulse bg-green-300 shadow-[0_0_8px_#86efac]" : "bg-white/18"}`} />
        </div>
        <div className="mt-1 truncate font-mono text-[9px] font-black uppercase tracking-tight" style={{ color: track.color }}>{track.name}</div>
        <div className="mt-1 grid grid-cols-[1fr_32px] gap-1">
          <div className="truncate rounded-sm bg-black/80 px-1 py-0.5 font-mono text-[7px] uppercase text-white/35">{track.kind}</div>
          <div className="rounded-sm border border-white/10 bg-white/[.04] px-1 py-0.5 text-center font-mono text-[7px] font-black text-white/45">{bus}</div>
        </div>
      </div>

      <div className="mt-1.5 h-7 overflow-hidden rounded-sm border border-white/10 bg-black/90">
        <StudioWaveform color={track.color} row={1} playing={playing || selected} />
      </div>

      <button
        onClick={(event) => {
          event.stopPropagation();
          onAiMix?.();
        }}
        className="mt-1.5 rounded-sm border border-cyan-300/25 bg-cyan-300/10 px-1 py-1 font-mono text-[8px] font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/15"
      >
        AI MIX
      </button>

      <div className="mt-1.5 grid grid-cols-2 gap-1">
        {INSERTS.map((insert, index) => <button key={insert} onClick={(event) => event.stopPropagation()} className={`rounded-sm border px-1 py-1 font-mono text-[7px] font-black uppercase ${index < 2 ? "border-cyan-300/22 bg-cyan-300/[.08] text-cyan-100" : "border-white/10 bg-white/[.025] text-white/35"}`}>{insert}</button>)}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {SENDS.map((send, index) => <div key={send} className="rounded-sm border border-white/10 bg-black/45 p-1">
          <div className="flex items-center justify-between"><span className="font-mono text-[7px] font-black uppercase text-white/35">{send}</span><span className="font-mono text-[7px] text-white/25">{index === 0 ? "12" : index === 1 ? "7" : "0"}</span></div>
          <div className="mt-1 h-0.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${index === 0 ? 38 : index === 1 ? 22 : 4}%`, background: track.color }} /></div>
        </div>)}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        <button onClick={(event) => { event.stopPropagation(); onUpdate({ muted: !track.muted }); }} className={`rounded-sm border py-1 font-mono text-[8px] font-black ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 bg-[#0c1115] text-white/45"}`}>M</button>
        <button onClick={(event) => { event.stopPropagation(); onUpdate({ solo: !track.solo }); }} className={`rounded-sm border py-1 font-mono text-[8px] font-black ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 bg-[#0c1115] text-white/45"}`}>S</button>
        <button onClick={(event) => { event.stopPropagation(); onUpdate({ armed: !track.armed }); }} className={`rounded-sm border py-1 font-mono text-[8px] font-black ${track.armed ? "border-red-300 bg-red-300/20 text-red-100" : "border-white/10 bg-[#0c1115] text-white/45"}`}>R</button>
      </div>

      <div className="mt-1.5 rounded-sm border border-white/10 bg-[#05080a] p-1.5 shadow-[inset_0_0_18px_rgba(0,0,0,.85)]">
        <div className="mb-1 flex items-center justify-between"><span className="font-mono text-[7px] font-black uppercase text-white/35">PAN</span><span className="font-mono text-[7px] text-white/35">{track.pan}</span></div>
        <input aria-label={`${track.name} pan`} type="range" min="-50" max="50" value={track.pan} onChange={(event) => onUpdate({ pan: Number(event.target.value) })} className="w-full accent-cyan-300" />
      </div>

      <div className="mt-1.5 grid grid-cols-[16px_1fr] gap-2 rounded-sm border border-white/10 bg-[#040608] p-1.5 shadow-[inset_0_0_22px_rgba(0,0,0,.9)]">
        <div className="relative h-[370px] rounded-sm bg-black/90 ring-1 ring-white/10">
          <div className="absolute inset-x-0 top-[10%] h-px bg-red-400/50" />
          <div className="absolute inset-x-0 top-[28%] h-px bg-yellow-300/35" />
          <div className="absolute inset-x-0 top-[50%] h-px bg-white/10" />
          <div ref={bindMeter?.(track.id)} className="absolute bottom-0 left-0 right-0 rounded-sm transition-[height] duration-75" style={{ height: `${track.muted ? 4 : track.meter}%`, background: `linear-gradient(to top, #22c55e 0%, #a3e635 48%, #facc15 72%, #fb7185 100%)`, boxShadow: active ? `0 0 14px ${track.color}` : undefined }} />
        </div>
        <div className="flex h-[370px] flex-col items-center justify-between">
          <div className="grid w-full gap-1">
            {[-12, -6, 0, 6].map((mark) => <div key={mark} className="flex items-center gap-1"><span className="h-px flex-1 bg-white/10" /><span className="font-mono text-[6px] text-white/25">{mark}</span></div>)}
          </div>
          <input aria-label={`${track.name} volume`} type="range" min="0" max="100" value={track.volume} onChange={(event) => onUpdate({ volume: Number(event.target.value) })} className="h-[245px] w-7 accent-cyan-300 [writing-mode:vertical-rl]" />
          <span className="rounded-sm border border-white/10 bg-black/80 px-2 py-1 font-mono text-[8px] font-black text-white/60">{track.volume}</span>
        </div>
      </div>

      <div className="mt-1.5 rounded-sm border border-white/10 bg-[#0b1014] px-1 py-1 text-center font-mono text-[7px] uppercase tracking-widest text-white/30">
        {track.muted ? "MUTED" : track.solo ? "SOLO" : "READY"}
      </div>
    </div>
  );
}

export default memo(StudioMixerChannel);
