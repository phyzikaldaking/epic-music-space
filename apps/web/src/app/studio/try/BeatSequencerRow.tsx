"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  track: StudioTrack;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<StudioTrack>) => void;
  onAiMix: () => void;
};

function BeatSequencerRow({ track, index, selected, onSelect, onUpdate, onAiMix }: Props) {
  return (
    <div
      className={`block w-full rounded-xl border p-3 text-left ${selected ? "border-green-300/60 bg-green-300/8" : "border-white/10 bg-[#071015]"}`}
    >
      <button onClick={onSelect} className="mb-2 flex w-full items-center justify-between text-left">
        <span className="font-black uppercase" style={{ color: track.color }}>{track.name}</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-white/45">{track.kind}</span>
      </button>
      <div className="mb-2 grid grid-cols-3 gap-1">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate({ muted: !track.muted });
          }}
          className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 bg-white/[.03] text-white/45"}`}
        >
          Mute
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onUpdate({ solo: !track.solo });
          }}
          className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 bg-white/[.03] text-white/45"}`}
        >
          Solo
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onAiMix();
          }}
          className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-2 py-2 text-[10px] font-black uppercase text-cyan-100"
        >
          AI Mix
        </button>
      </div>
      <div className="relative h-24 overflow-hidden rounded border border-white/10 bg-black/55">
        <StudioWaveform color={track.color} row={index} />
        {track.muted ? <div className="absolute inset-0 grid place-items-center bg-black/70 text-xs font-black uppercase tracking-widest text-pink-100">Muted</div> : null}
        {track.solo ? <div className="absolute right-2 top-2 rounded-full border border-yellow-300/40 bg-yellow-300/15 px-2 py-1 text-[9px] font-black uppercase text-yellow-100">Solo</div> : null}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[9px] uppercase text-white/35">
        <span>Vol {track.volume}</span>
        <span>Pan {track.pan}</span>
        <span>Meter {track.meter}</span>
      </div>
    </div>
  );
}

export default memo(BeatSequencerRow);
