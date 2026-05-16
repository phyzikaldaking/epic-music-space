"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  track: StudioTrack;
  selected: boolean;
  playing?: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioTrack>) => void;
  bindMeter?: (trackId: string) => (element: HTMLDivElement | null) => void;
};

function StudioMixerChannel({ track, selected, playing = false, onSelect, onUpdate, bindMeter }: Props) {
  const meterState = playing && !track.muted ? "shadow-[0_0_18px_rgba(34,211,238,.24)]" : "";

  return (
    <div
      onClick={onSelect}
      data-testid={`studio-mixer-channel-${track.id}`}
      className={`flex min-h-[700px] flex-col rounded-lg border p-2 transition-shadow duration-200 ${selected ? "bg-white/[.07]" : "bg-black/45"} ${meterState}`}
      style={{
        borderColor: selected ? track.color : "rgba(255,255,255,.12)",
        boxShadow: selected ? `0 0 18px ${track.color}32` : undefined,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>
          {track.name}
        </div>
        <span className={`h-2 w-2 rounded-full ${playing && !track.muted ? "animate-pulse bg-green-300 shadow-[0_0_12px_#86efac]" : "bg-white/20"}`} />
      </div>

      <div className="mt-1 h-10 overflow-hidden rounded bg-black/70">
        <StudioWaveform color={track.color} row={1} playing={playing || selected} />
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
            ref={bindMeter?.(track.id)}
            className="absolute bottom-0 w-full rounded-full transition-[height] duration-75"
            style={{
              height: `${track.muted ? 4 : track.meter}%`,
              background: track.color,
              boxShadow: playing && !track.muted ? `0 0 18px ${track.color}` : undefined,
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
