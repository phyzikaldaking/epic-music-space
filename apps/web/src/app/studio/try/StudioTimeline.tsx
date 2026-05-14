"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  playing: boolean;
  bar: number;
};

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar }: Props) {
  return (
    <section className="relative min-h-[260px] overflow-y-auto overscroll-contain rounded-xl border border-white/12 bg-[#071015]">
      <div className="sticky top-0 z-[3] flex h-7 items-center border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} className="flex-1">{index * 8 + 1}</span>
        ))}
      </div>

      <div className="relative min-h-[300px] px-2 py-1">
        <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)] [background-size:42px_28px]" />

        <div className="absolute top-0 h-full w-px bg-yellow-300 shadow-[0_0_22px_#f6d63d]" style={{ left: `${Math.min(96, bar / 1.32)}%` }} />

        {tracks.map((track, row) => (
          <button
            key={track.id}
            onClick={() => setSelectedTrack(track.id)}
            className={`relative z-[1] mb-1 flex h-9 w-full items-center overflow-hidden rounded-md border text-left transition ${selectedTrack === track.id ? "border-cyan-300/70 bg-cyan-300/8" : "border-white/8 bg-white/[.025]"}`}
          >
            <span className="w-24 shrink-0 px-2 text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>
              {track.name}
            </span>

            <div className="relative h-full flex-1">
              <StudioWaveform color={track.color} row={row} />
            </div>
          </button>
        ))}
      </div>

      {playing && (
        <div className="absolute right-3 top-9 rounded-full border border-green-300/35 bg-green-300/10 px-2 py-1 text-[10px] font-black uppercase text-green-200">
          Playing
        </div>
      )}
    </section>
  );
}

export default memo(StudioTimeline);
