"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  track: StudioTrack;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioTrack>) => void;
};

function StudioMixerChannel({ track, selected, onSelect, onUpdate }: Props) {
  return (
    <div
      onClick={onSelect}
      className={`flex min-h-[700px] flex-col rounded-lg border p-2 ${selected ? "bg-white/[.07]" : "bg-black/45"}`}
      style={{
        borderColor: selected ? track.color : "rgba(255,255,255,.12)",
        boxShadow: selected ? `0 0 20px ${track.color}35` : undefined,
      }}
    >
      <div className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>
        {track.name}
      </div>

      <div className="mt-1 h-10 rounded bg-black/70">
        <StudioWaveform color={track.color} row={1} />
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

      <div className="mt-2 flex min-h-[430px] flex-1 items-end justify-center gap-2">
        <div className="relative h-full w-3 rounded-full bg-white/10">
          <div
            className="absolute bottom-0 w-full rounded-full"
            style={{
              height: `${track.muted ? 4 : track.meter}%`,
              background: track.color,
              boxShadow: `0 0 14px ${track.color}`,
            }}
          />
        </div>

        <input
          aria-label={`${track.name} volume`}
          type="range"
          min="0"
          max="100"
          value={track.volume}
          onChange={(event) => onUpdate({ volume: Number(event.target.value) })}
          className="h-full w-6 accent-cyan-300 [writing-mode:vertical-rl]"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-1">
        <span className="text-[9px] text-white/35">PAN</span>

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
    </div>
  );
}

export default memo(StudioMixerChannel);
