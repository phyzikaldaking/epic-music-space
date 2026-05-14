"use client";

import Link from "next/link";
import { memo } from "react";
import type { StudioTrackKind } from "./studioWorkstationTypes";
import type { useStudioMidiBridge } from "./useStudioMidiBridge";

type Props = {
  midi: ReturnType<typeof useStudioMidiBridge>;
  onAddTrack: (kind?: StudioTrackKind) => void;
};

function BeatTransport({ midi, onAddTrack }: Props) {
  return (
    <div className="sticky top-0 z-10 mb-3 rounded-xl border border-white/10 bg-black/85 p-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Beat preview</p>
        <Link href="/studio/beat-machine" className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-100">Open Full Beat Machine</Link>
        <button onClick={midi.connect} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">MIDI {midi.status}</button>
      </div>
      {midi.lastEvent && <p className="mt-2 text-[10px] uppercase tracking-widest text-white/45">Last MIDI: {midi.lastEvent}</p>}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <button onClick={() => onAddTrack("drum")} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 py-2 text-xs font-black uppercase text-cyan-100">+ Drum Track</button>
        <button onClick={() => onAddTrack("bass")} className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 py-2 text-xs font-black uppercase text-yellow-100">+ Bass Track</button>
        <button onClick={() => onAddTrack("melody")} className="rounded-lg border border-green-300/35 bg-green-300/10 py-2 text-xs font-black uppercase text-green-100">+ Melody Track</button>
      </div>
    </div>
  );
}

export default memo(BeatTransport);
