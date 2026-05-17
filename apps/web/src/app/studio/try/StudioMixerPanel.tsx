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
    <section data-testid="studio-live-mixer" className="relative block h-[calc(100dvh-142px)] w-full min-w-0 overflow-hidden rounded-xl border border-[#31383b] bg-[#050708] p-2 shadow-[0_24px_70px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.08),inset_0_-24px_60px_rgba(0,0,0,.62)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(116,140,146,.18),transparent_34%),radial-gradient(circle_at_10%_100%,rgba(34,211,238,.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,.035),transparent_18%,rgba(0,0,0,.35))]" />
      <div className="relative z-10 flex h-full min-h-0 flex-col rounded-lg border border-black/80 bg-[#0a0d0f] shadow-[inset_0_0_0_1px_rgba(255,255,255,.04),inset_0_0_40px_rgba(0,0,0,.75)]">
        <div className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-black/80 bg-[#161b1d]/98 px-3 py-2 shadow-[0_12px_24px_rgba(0,0,0,.48)] backdrop-blur">
          <div className="hidden min-w-[180px] md:block">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.28em] text-[#c7d4d6]">EMS SSL Console</div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[#738085]">Faders / tone / sends</div>
          </div>
          <div className="rounded-sm border border-[#2d3538] bg-[#07090a] px-3 py-2 font-mono text-[9px] font-black uppercase tracking-[0.18em] text-[#a7b5b8] shadow-[inset_0_0_14px_rgba(0,0,0,.75)]">
            {safeTracks.length} CH
          </div>
          <button onClick={autoMix} className={`rounded border px-3 py-1.5 ${EMS_VISUAL_SYSTEM.text.tiny} ${EMS_VISUAL_SYSTEM.button.cyan}`}>AI Mix All</button>
          <button onClick={resetSolosMutes} className={`rounded border px-3 py-1.5 ${EMS_VISUAL_SYSTEM.text.tiny} ${EMS_VISUAL_SYSTEM.button.idle}`}>Clear M/S</button>
          <div className="ml-auto flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${playing ? "animate-pulse bg-green-300 shadow-[0_0_14px_#86efac]" : "bg-white/20"}`} />
            <div className="h-7 w-52 overflow-hidden rounded-sm border border-[#334045] bg-black/80 p-0.5 shadow-[inset_0_0_14px_rgba(0,0,0,.85)]">
              <div className="h-full rounded-[2px] bg-gradient-to-r from-green-300 via-yellow-300 to-red-500 transition-[width] duration-75" style={{ width: `${masterPeak}%` }} />
            </div>
            <span className="w-16 text-right font-mono text-[9px] font-black uppercase tracking-widest text-white/45">{Math.round(masterPeak)}%</span>
          </div>
        </div>
        <div className="ems-scroll min-h-0 flex-1 overflow-auto border-t border-white/5 bg-[radial-gradient(circle_at_top,#182226_0%,#070a0c_42%,#000_100%)] p-3">
          <div className="flex min-h-full w-max min-w-full items-stretch gap-2 pb-5">
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
      </div>
    </section>
  );
}

export default memo(StudioMixerPanel);