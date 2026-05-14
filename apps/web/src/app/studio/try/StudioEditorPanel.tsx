"use client";

import { memo } from "react";
import StudioWaveform from "./StudioWaveform";
import VirtualTrackList from "./VirtualTrackList";
import type { StudioTrack, StudioTrackKind } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  addTrack: (kind?: StudioTrackKind) => void;
};

function StudioEditorPanel({ tracks, selectedTrack, setSelectedTrack, addTrack }: Props) {
  return (
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-black/45 p-3 pr-2">
      <div className="sticky top-0 z-10 mb-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/80 p-2 backdrop-blur">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">Edit / Record</p>
          <h2 className="text-lg font-black uppercase">Waveform lanes</h2>
        </div>
        <button onClick={() => addTrack("vocal")} className="rounded-lg border border-pink-300/35 bg-pink-300/10 px-3 py-2 text-xs font-black uppercase text-pink-100">+ Vocal Track</button>
      </div>

      <VirtualTrackList tracks={tracks} rowHeight={116} height={610}>
        {(track, row) => (
          <button key={track.id} onClick={() => setSelectedTrack(track.id)} className={`block w-full rounded-xl border bg-[#071015] p-3 text-left ${selectedTrack === track.id ? "border-cyan-300/60" : "border-white/10"}`}>
            <div className="mb-2 flex justify-between">
              <span className="font-black uppercase" style={{ color: track.color }}>{track.name}</span>
              <span className="text-xs uppercase text-white/40">{track.kind}</span>
            </div>
            <div className="relative h-20 overflow-hidden rounded border border-white/10 bg-black/55">
              <StudioWaveform color={track.color} row={row} />
            </div>
          </button>
        )}
      </VirtualTrackList>
    </section>
  );
}

export default memo(StudioEditorPanel);
