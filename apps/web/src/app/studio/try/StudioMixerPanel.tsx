"use client";

import { memo, useEffect, useMemo, useState } from "react";
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
  const [masterPeak, setMasterPeak] = useState(72);

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const now = performance.now();
      let total = 0;
      tracks.forEach((track, index) => {
        const wave = Math.sin(now / (playing ? 120 : 420) + index * 0.83) * 22;
        const bounce = Math.cos(now / (playing ? 180 : 620) + index * 1.41) * 14;
        const base = playing ? 48 : 18;
        const next = track.muted ? 4 : Math.max(8, Math.min(98, base + wave + bounce + ((index * 7 + frame) % 18)));
        total += next;
        meters.setMeterValue(track.id, next);
      });
      setMasterPeak(Math.max(12, Math.min(99, total / Math.max(1, tracks.length) + (playing ? Math.sin(now / 95) * 10 : 0))));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [meters, playing, tracks]);

  return (
    <section data-testid="studio-live-mixer" className={`min-h-[680px] min-w-[1040px] overflow-visible rounded-xl border border-white/10 bg-[#0b1115] p-2 ${playing ? "shadow-[0_0_44px_rgba(34,211,238,.14)]" : "shadow-[0_0_24px_rgba(255,255,255,.05)]"}`}>
      <header className="mb-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/45 px-3 py-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-200/60">Live mixer</p>
          <h2 className="text-xl font-black uppercase tracking-wider text-white">Channel activity</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${playing ? "animate-pulse bg-green-300 shadow-[0_0_18px_#86efac]" : "bg-white/20"}`} />
          <div className="h-10 w-40 overflow-hidden rounded-full border border-cyan-300/20 bg-black/60 p-1">
            <div className="h-full rounded-full bg-gradient-to-r from-green-300 via-yellow-300 to-pink-400 transition-[width] duration-75" style={{ width: `${masterPeak}%` }} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-white/45">Master {Math.round(masterPeak)}%</span>
        </div>
      </header>
      <div className="grid min-h-[900px] min-w-[1280px] grid-cols-8 gap-2 pb-8 pr-8">
        {tracks.map((track) => (
          <StudioMixerChannel
            key={track.id}
            track={track}
            selected={selectedTrack === track.id}
            playing={playing}
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
