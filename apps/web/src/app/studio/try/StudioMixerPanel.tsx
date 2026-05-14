"use client";

import { memo } from "react";
import StudioMixerChannel from "./StudioMixerChannel";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
};

function StudioMixerPanel({ tracks, selectedTrack, setSelectedTrack, updateTrack }: Props) {
  return (
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#0b1115] p-2 pr-1">
      <div className="grid min-h-[760px] grid-cols-4 gap-2 lg:grid-cols-8">
        {tracks.map((track) => (
          <StudioMixerChannel
            key={track.id}
            track={track}
            selected={selectedTrack === track.id}
            onSelect={() => setSelectedTrack(track.id)}
            onUpdate={(patch) => updateTrack(track.id, patch)}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(StudioMixerPanel);
