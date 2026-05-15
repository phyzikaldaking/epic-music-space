"use client";

import { memo, useEffect, useMemo } from "react";
import StudioMixerChannel from "./StudioMixerChannel";
import { useRafMeterBridge } from "./useRafMeterBridge";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  playing?: boolean;
  setSelectedTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
};

function StudioMixerPanel({ tracks, selectedTrack, playing = false, setSelectedTrack, updateTrack }: Props) {
  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks]);
  const meters = useRafMeterBridge(trackIds);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      tracks.forEach((track, index) => {
        meters.setMeterValue(track.id, track.muted ? 4 : Math.max(16, Math.min(98, 35 + ((now / 140 + index * 19) % 56))));
      });
    }, playing ? 120 : 420);

    return () => window.clearInterval(id);
  }, [meters, playing, tracks]);

  return (
    <section className="max-h-[calc(100vh-170px)] min-h-[680px] min-w-[1040px] overflow-auto overscroll-contain rounded-xl border border-white/10 bg-[#0b1115] p-2">
      <div className="grid min-h-[900px] min-w-[1280px] grid-cols-8 gap-2 pb-8 pr-8">
        {tracks.map((track) => (
          <StudioMixerChannel
            key={track.id}
            track={track}
            selected={selectedTrack === track.id}
            bindMeter={meters.bindMeter}
            onSelect={() => setSelectedTrack(track.id)}
            onUpdate={(patch) => updateTrack(track.id, patch)}
          />
        ))}
      </div>
    </section>
  );
}

export default memo(StudioMixerPanel);