"use client";

import { memo, useEffect, useMemo, useState } from "react";
import StudioMixerChannel from "./StudioMixerChannel";
import { EMS_VISUAL_SYSTEM } from "./emsVisualSystem";
import { useRafMeterBridge } from "./useRafMeterBridge";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  playing?: boolean;
  setSelectedTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
};

function templateForTrack(track: StudioTrack, index: number) {
  const name = `${track.name} ${track.kind}`.toLowerCase();
  if (name.includes("master")) return { volume: 78, pan: 0, meter: 76 };
  if (name.includes("kick") || name.includes("drum")) return { volume: 84, pan: 0, meter: 86 };
  if (name.includes("808") || name.includes("bass")) return { volume: 76, pan: 0, meter: 72 };
  if (name.includes("snare") || name.includes("clap")) return { volume: 72, pan: 0, meter: 68 };
  if (name.includes("hat") || name.includes("perc")) return { volume: 56, pan: index % 2 ? 18 : -18, meter: 55 };
  if (name.includes("vocal") || name.includes("vox") || name.includes("lead")) return { volume: 82, pan: 0, meter: 80 };
  if (name.includes("fx")) return { volume: 48, pan: index % 2 ? 28 : -28, meter: 42 };
  if (name.includes("keys") || name.includes("melody") || name.includes("pad")) return { volume: 60, pan: index % 2 ? 14 : -14, meter: 54 };
  return { volume: 62, pan: index % 2 ? 8 : -8, meter: 52 };
}

function StudioMixerPanel({ tracks, selectedTrack, playing = false, setSelectedTrack, updateTrack }: Props) {
  const safeTracks = tracks.length ? tracks : [{ id: "empty-mix", name: "No Tracks Loaded", kind: "audio" as const, color: "#17fff4", volume: 0, pan: 0, muted: false, solo: false, armed: false, meter: 0, height: 72 }];
  const trackIds = useMemo(() => safeTracks.map((track) => track.id), [safeTracks]);
  const meters = useRafMeterBridge(trackIds);
  const [masterPeak, setMasterPeak] = useState(72);

  useEffect(() => {
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      const now = performance.now();
      let total = 0;
      safeTracks.forEach((track, index) => {
        const wave = Math.sin(now / (playing ? 120 : 420) + index * 0.83) * 22;
        const bounce = Math.cos(now / (playing ? 180 : 620) + index * 1.41) * 14;
        const base = playing ? 48 : 18;
        const next = track.muted ? 4 : Math.max(8, Math.min(98, base + wave + bounce + ((index * 7 + frame) % 18)));
        total += next;
        meters.setMeterValue(track.id, next);
      });
      setMasterPeak(Math.max(12, Math.min(99, total / Math.max(1, safeTracks.length) + (playing ? Math.sin(now / 95) * 10 : 0))));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [meters, playing, safeTracks]);

  function autoMix() {
    tracks.forEach((track, index) => updateTrack(track.id, templateForTrack(track, index)));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "AI mix applied to full console." } }));
  }

  function autoMixTrack(track: StudioTrack, index: number) {
    if (track.id === "empty-mix") return;
    updateTrack(track.id, templateForTrack(track, index));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `AI mixed ${track.name}.` } }));
  }

  function resetSolosMutes() {
    tracks.forEach((track) => updateTrack(track.id, { muted: false, solo: false }));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: "Mute and solo cleared." } }));
  }

  return (
    <section data-testid="studio-live-mixer" className={`relative block h-[calc(100dvh-142px)] w-full min-w-0 overflow-hidden rounded-lg p-1 ${EMS_VISUAL_SYSTEM.shell.console}`}>
      <div className={`sticky top-0 z-20 flex min-h-10 items-center gap-2 rounded-md border border-white/10 px-2 py-1 backdrop-blur ${EMS_VISUAL_SYSTEM.shell.rail}`}>
        <button onClick={autoMix} className={`rounded border px-3 py-1.5 ${EMS_VISUAL_SYSTEM.text.tiny} ${EMS_VISUAL_SYSTEM.button.cyan}`}>AI Mix All</button>
        <button onClick={resetSolosMutes} className={`rounded border px-3 py-1.5 ${EMS_VISUAL_SYSTEM.text.tiny} ${EMS_VISUAL_SYSTEM.button.idle}`}>Clear M/S</button>
        <div className="ml-2 hidden h-5 w-24 items-center justify-center rounded-sm border border-cyan-300/20 bg-black/50 font-mono text-[8px] font-black uppercase tracking-[0.22em] text-cyan-100/80 md:flex">EMS</div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${playing ? "animate-pulse bg-green-300 shadow-[0_0_14px_#86efac]" : "bg-white/20"}`} />
          <div className="h-6 w-52 overflow-hidden rounded-sm border border-cyan-300/25 bg-black/75 p-0.5 shadow-[inset_0_0_14px_rgba(0,0,0,.85)]">
            <div className="h-full rounded-[2px] bg-gradient-to-r from-green-300 via-yellow-300 to-pink-400 transition-[width] duration-75" style={{ width: `${masterPeak}%` }} />
          </div>
          <span className="w-16 text-right font-mono text-[9px] font-black uppercase tracking-widest text-white/45">{Math.round(masterPeak)}%</span>
        </div>
      </div>
      <div className="ems-scroll h-[calc(100%-44px)] w-full min-w-0 overflow-auto rounded-md border border-white/10 bg-[radial-gradient(circle_at_top,#10202a_0%,#030507_42%,#000_100%)] p-1">
        <div className="flex min-h-full w-max min-w-full items-stretch gap-1 pb-4">
          {safeTracks.map((track, index) => (
            <StudioMixerChannel
              key={track.id}
              track={track}
              channelIndex={index + 1}
              selected={selectedTrack === track.id}
              playing={playing}
              bindMeter={meters.bindMeter}
              onSelect={() => setSelectedTrack(track.id)}
              onUpdate={(patch) => track.id !== "empty-mix" && updateTrack(track.id, patch)}
              onAiMix={() => autoMixTrack(track, index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default memo(StudioMixerPanel);
