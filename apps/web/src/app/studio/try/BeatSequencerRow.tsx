"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  track: StudioTrack;
  index: number;
  selected: boolean;
  onSelect: () => void;
};

function BeatSequencerRow({ track, index, selected, onSelect }: Props) {
  return (
    <button
      onClick={onSelect}
      className={`block w-full rounded-xl border p-3 text-left ${selected ? "border-green-300/60 bg-green-300/8" : "border-white/10 bg-[#071015]"}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-black uppercase" style={{ color: track.color }}>{track.name}</span>
        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-white/45">{track.kind}</span>
      </div>
      <div className="relative h-24 overflow-hidden rounded border border-white/10 bg-black/55">
        <StudioWaveform color={track.color} row={index} />
      </div>
    </button>
  );
}

export default memo(BeatSequencerRow);
