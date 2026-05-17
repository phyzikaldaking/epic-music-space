"use client";

import { memo } from "react";
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

const INSERTS = ["IN", "EQ", "DYN", "SAT"];
const SENDS = ["A", "B", "C"];
const FADER_MARKS = ["+10", "+5", "0", "-5", "-10", "-20", "-40", "∞"];

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
  const isMaster = bus === "MST";

  return (
    <div
      onClick={onSelect}
      data-testid={`studio-mixer-channel-${track.id}`}
      className={`flex h-[812px] w-[112px] shrink-0 flex-col border border-[#2d3234] bg-[#171b1d] shadow-[inset_1px_0_0_rgba(255,255,255,.06),inset_-1px_0_0_rgba(0,0,0,.8),0_10px_28px_rgba(0,0,0,.45)] transition-none ${selected ? "ring-2 ring-[#d9e8ea]/80" : ""}`}
    >
      <div className="border-b border-black/80 bg-[#20272a] px-2 py-2">
        <div className="flex items-center justify-between font-mono text-[8px] font-black uppercase tracking-[0.16em] text-[#8d999d]">
          <span>{String(channelIndex).padStart(2, "0")}</span>
          <span className={`h-2 w-2 rounded-full ${active ? "bg-[#72ff72] shadow-[0_0_8px_rgba(114,255,114,.8)]" : "bg-[#343c3f]"}`} />
        </div>
        <div className="mt-2 truncate rounded-sm border border-black/70 bg-[#090b0c] px-1.5 py-1 text-center font-mono text-[9px] font-black uppercase tracking-tight text-[#e7ecec]">
          {track.name}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-[7px] font-black uppercase tracking-widest text-[#879195]">
          <span className="rounded-sm border border-black/60 bg-[#111719] px-1 py-0.5 text-center">{track.kind}</span>
          <span className="rounded-sm border border-black/60 bg-[#111719] px-1 py-0.5 text-center">{bus}</span>
        </div>
      </div>

      <div className="border-b border-black/80 bg-[#24292b] p-1.5">
        <div className="mb-1 font-mono text-[7px] font-black uppercase tracking-[0.18em] text-[#7d898c]">Input / Inserts</div>
        <div className="grid grid-cols-2 gap-1">
          {INSERTS.map((insert, index) => (
            <button
              key={insert}
              onClick={(event) => event.stopPropagation()}
              className={`h-6 rounded-sm border border-black/70 font-mono text-[8px] font-black uppercase shadow-[inset_0_1px_0_rgba(255,255,255,.08)] ${index === 0 ? "bg-[#345566] text-[#c8f4ff]" : index === 1 ? "bg-[#243d63] text-[#bcdcff]" : index === 2 ? "bg-[#244c36] text-[#c5ffd7]" : "bg-[#3b2f23] text-[#ffd9a8]"}`}
            >
              {insert}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-black/80 bg-[#1d2325] p-1.5">
        <div className="mb-1 flex items-center justify-between font-mono text-[7px] font-black uppercase tracking-[0.16em] text-[#7d898c]">
          <span>SSL EQ</span>
          <span className="text-[#91a3a8]">4B</span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {["HF", "HMF", "LMF", "LF"].map((band) => (
            <div key={band} className="grid h-10 place-items-center rounded-sm border border-black/70 bg-[#101516]">
              <div className="h-5 w-5 rounded-full border border-[#6f7c80] bg-[radial-gradient(circle_at_35%_30%,#d6dee0,#394245_45%,#0b0e0f_70%)] shadow-[inset_0_0_6px_rgba(0,0,0,.8)]" />
              <span className="font-mono text-[6px] font-black text-[#839095]">{band}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-black/80 bg-[#202528] p-1.5">
        <div className="mb-1 font-mono text-[7px] font-black uppercase tracking-[0.18em] text-[#7d898c]">Sends</div>
        <div className="grid grid-cols-3 gap-1">
          {SENDS.map((send, index) => (
            <div key={send} className="rounded-sm border border-black/70 bg-[#101516] p-1">
              <div className="text-center font-mono text-[7px] font-black text-[#a0aaad]">{send}</div>
              <div className="mx-auto mt-1 h-4 w-4 rounded-full border border-[#6f7c80] bg-[#252d30]" />
              <div className="mt-1 h-1 rounded-full bg-black/70">
                <div className="h-full rounded-full bg-[#d9a441]" style={{ width: `${index === 0 ? 42 : index === 1 ? 18 : 4}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-black/80 bg-[#171d1f] p-1.5">
        <div className="mb-1 flex items-center justify-between font-mono text-[7px] font-black uppercase tracking-[0.16em] text-[#7d898c]">
          <span>Pan</span>
          <span>{track.pan}</span>
        </div>
        <input aria-label={`${track.name} pan`} type="range" min="-50" max="50" value={track.pan} onChange={(event) => onUpdate({ pan: Number(event.target.value) })} className="w-full accent-[#cad7d8]" />
      </div>

      <div className="border-b border-black/80 bg-[#202528] p-1.5">
        <div className="grid grid-cols-3 gap-1">
          <button onClick={(event) => { event.stopPropagation(); onUpdate({ muted: !track.muted }); }} className={`h-7 rounded-sm border border-black/80 font-mono text-[9px] font-black ${track.muted ? "bg-[#e04756] text-white shadow-[0_0_10px_rgba(224,71,86,.5)]" : "bg-[#30383a] text-[#89959a]"}`}>M</button>
          <button onClick={(event) => { event.stopPropagation(); onUpdate({ solo: !track.solo }); }} className={`h-7 rounded-sm border border-black/80 font-mono text-[9px] font-black ${track.solo ? "bg-[#f0c24b] text-black shadow-[0_0_10px_rgba(240,194,75,.45)]" : "bg-[#30383a] text-[#89959a]"}`}>S</button>
          <button onClick={(event) => { event.stopPropagation(); onUpdate({ armed: !track.armed }); }} className={`h-7 rounded-sm border border-black/80 font-mono text-[9px] font-black ${track.armed ? "bg-[#d73333] text-white shadow-[0_0_10px_rgba(215,51,51,.5)]" : "bg-[#30383a] text-[#89959a]"}`}>R</button>
        </div>
      </div>

      <div className="flex flex-1 gap-1 border-b border-black/80 bg-[#101416] p-1.5">
        <div className="relative h-full w-5 rounded-sm border border-black bg-[#050606] shadow-[inset_0_0_10px_rgba(0,0,0,.9)]">
          <div className="absolute inset-x-0 top-[9%] h-px bg-[#f04949]/80" />
          <div className="absolute inset-x-0 top-[24%] h-px bg-[#f0c24b]/70" />
          <div className="absolute inset-x-0 top-[48%] h-px bg-white/20" />
          <div ref={bindMeter?.(track.id)} className="absolute bottom-0 left-0 right-0 transition-none" style={{ height: `${track.muted ? 3 : track.meter}%`, background: "linear-gradient(to top,#28d75f 0%,#c9f443 58%,#f0c24b 76%,#e04756 100%)" }} />
        </div>

        <div className="relative flex flex-1 items-center justify-center rounded-sm border border-black bg-[#181d1f] shadow-[inset_0_0_16px_rgba(0,0,0,.85)]">
          <div className="absolute left-1 top-2 bottom-2 flex flex-col justify-between font-mono text-[6px] text-[#6e7b7f]">
            {FADER_MARKS.map((mark) => <span key={mark}>{mark}</span>)}
          </div>
          <div className="absolute bottom-5 top-5 w-2 rounded-full bg-[#070809] shadow-[inset_0_0_8px_rgba(0,0,0,.95)]" />
          <input aria-label={`${track.name} volume`} type="range" min="0" max="100" value={track.volume} onChange={(event) => onUpdate({ volume: Number(event.target.value) })} className="relative z-10 h-[300px] w-8 accent-[#dfe8e8] [writing-mode:vertical-rl]" />
        </div>
      </div>

      <div className={`grid h-12 place-items-center border-t border-white/5 bg-[#22282a] px-1 text-center font-mono text-[8px] font-black uppercase tracking-[0.18em] ${isMaster ? "text-[#f0c24b]" : "text-[#cad7d8]"}`}>
        <span className="truncate">{track.muted ? "Muted" : track.solo ? "Solo" : track.armed ? "Rec Ready" : `${track.volume}`}</span>
      </div>
    </div>
  );
}

export default memo(StudioMixerChannel);