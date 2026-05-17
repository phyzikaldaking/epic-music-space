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
  bindMeter?: (trackId: string) => (element: HTMLDivElement | null) => void;
};

const INSERTS = ["EQ", "COMP", "SAT", "GATE"];
const SENDS = ["A VERB", "B DELAY", "C PAR"];

function busFor(track: StudioTrack) {
  if (["drum", "bass"].includes(track.kind)) return "DRUM BUS";
  if (["melody", "instrument", "midi"].includes(track.kind)) return "MUSIC BUS";
  if (track.kind === "vocal") return "VOCAL BUS";
  if (track.kind === "fx") return "FX BUS";
  return track.name.toLowerCase().includes("master") ? "MASTER" : "AUX BUS";
}

function StudioMixerChannel({ track, selected, playing = false, channelIndex = 1, onSelect, onUpdate, bindMeter }: Props) {
  const meterState = playing && !track.muted ? "shadow-[0_0_18px_rgba(34,211,238,.24)]" : "";
  const bus = busFor(track);

  return (
    <div
      onClick={onSelect}
      data-testid={`studio-mixer-channel-${track.id}`}
      className={`flex h-[880px] w-[148px] shrink-0 flex-col rounded-xl border p-2 transition-shadow duration-200 ${selected ? "bg-white/[.075]" : "bg-black/55"} ${meterState}`}
      style={{
        borderColor: selected ? track.color : "rgba(255,255,255,.12)",
        boxShadow: selected ? `0 0 20px ${track.color}36` : undefined,
      }}
    >
      <div className="rounded-lg border border-white/10 bg-black/70 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-black uppercase text-white/35">CH {channelIndex}</span>
          <span className={`h-2 w-2 rounded-full ${playing && !track.muted ? "animate-pulse bg-green-300 shadow-[0_0_12px_#86efac]" : "bg-white/20"}`} />
        </div>
        <div className="mt-1 truncate text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>
          {track.name}
        </div>
        <div className="mt-1 rounded-full border border-white/10 bg-white/[.04] px-2 py-1 text-center text-[8px] font-black uppercase text-white/40">{bus}</div>
      </div>

      <div className="mt-2 h-10 overflow-hidden rounded bg-black/75 ring-1 ring-white/10">
        <StudioWaveform color={track.color} row={1} playing={playing || selected} />
      </div>

      <div className="mt-2 grid gap-1">
        {INSERTS.map((insert, index) => <button key={insert} onClick={(event) => event.stopPropagation()} className={`rounded border px-2 py-1 text-[8px] font-black uppercase ${index < 2 ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[.03] text-white/35"}`}>{insert}</button>)}
      </div>

      <div className="mt-2 grid gap-1">
        {SENDS.map((send, index) => <div key={send} className="rounded border border-white/10 bg-white/[.025] p-1">
          <div className="flex items-center justify-between"><span className="text-[8px] font-black uppercase text-white/35">{send}</span><span className="text-[8px] text-white/25">{index === 0 ? "12" : index === 1 ? "7" : "0"}</span></div>
          <div className="mt-1 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${index === 0 ? 38 : index === 1 ? 22 : 4}%`, background: track.color }} /></div>
        </div>)}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate({ muted: !track.muted });
          }}
          className={`rounded border py-1 text-[9px] font-black ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 text-white/45"}`}
        >
          M
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate({ solo: !track.solo });
          }}
          className={`rounded border py-1 text-[9px] font-black ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 text-white/45"}`}
        >
          S
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate({ armed: !track.armed });
          }}
          className={`rounded border py-1 text-[9px] font-black ${track.armed ? "border-red-300 bg-red-300/20 text-red-100" : "border-white/10 text-white/45"}`}
        >
          R
        </button>
      </div>

      <div className="mt-2 rounded-lg border border-white/10 bg-black/50 p-2">
        <div className="mb-1 flex items-center justify-between"><span className="text-[8px] font-black uppercase text-white/35">Pan</span><span className="text-[8px] text-white/35">{track.pan}</span></div>
        <input
          aria-label={`${track.name} pan`}
          type="range"
          min="-50"
          max="50"
          value={track.pan}
          onChange={(event) => onUpdate({ pan: Number(event.target.value) })}
          className="w-full accent-pink-400"
        />
      </div>

      <div className="mt-2 flex min-h-[360px] flex-1 items-end justify-center gap-3 rounded-lg border border-white/10 bg-black/45 p-2">
        <div className="relative h-full w-4 rounded-full bg-white/10">
          <div className="absolute left-0 right-0 top-[18%] h-px bg-yellow-300/35" />
          <div
            ref={bindMeter?.(track.id)}
            className="absolute bottom-0 w-full rounded-full transition-[height] duration-75"
            style={{
              height: `${track.muted ? 4 : track.meter}%`,
              background: `linear-gradient(to top, ${track.color}, #f6d63d, #ff4f8b)`,
              boxShadow: playing && !track.muted ? `0 0 18px ${track.color}` : undefined,
            }}
          />
        </div>

        <div className="flex h-full flex-col items-center gap-2">
          <input
            aria-label={`${track.name} volume`}
            type="range"
            min="0"
            max="100"
            value={track.volume}
            onChange={(event) => onUpdate({ volume: Number(event.target.value) })}
            className="h-full w-8 accent-cyan-300 [writing-mode:vertical-rl]"
          />
          <span className="rounded bg-black/70 px-2 py-1 text-[9px] font-black text-white/60">{track.volume}</span>
        </div>
      </div>

      <div className="mt-2 rounded-lg border border-white/10 bg-white/[.025] px-2 py-1 text-center text-[8px] uppercase tracking-widest text-white/35">
        AI lane · {track.kind}
      </div>
    </div>
  );
}

export default memo(StudioMixerChannel);
