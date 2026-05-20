"use client";

import { memo, useMemo, useState } from "react";
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

function buildPattern(track: StudioTrack, index: number) {
  return Array.from({ length: 32 }, (_, step) => {
    const seed = `${track.id}-${track.kind}-${index}-${step}`;
    let score = 0;
    for (let i = 0; i < seed.length; i += 1) score = (score + seed.charCodeAt(i) * (i + 3)) % 17;
    if (track.kind === "bass") return step % 8 === 0 || score > 13;
    if (track.kind === "drum") return step % 4 === 0 || score > 12;
    if (track.kind === "melody" || track.kind === "instrument" || track.kind === "midi") return score > 12;
    return score > 14;
  });
}

function BeatSequencerRow({ track, index, selected, onSelect, onUpdate, onAiMix }: Props) {
  const [pattern, setPattern] = useState<boolean[]>(() => buildPattern(track, index));
  const level = useMemo(() => Array.from({ length: 16 }, (_, meterIndex) => Math.max(16, ((track.meter + meterIndex * 7 + index * 11) % 92))), [index, track.meter]);

  return (
    <div
      className={`block w-full rounded-[18px] border p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${selected ? "border-green-300/60 bg-[linear-gradient(180deg,rgba(72,255,179,.12),rgba(7,16,21,.96))]" : "border-white/10 bg-[linear-gradient(180deg,#0a1218,#06090d)]"}`}
    >
      <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_120px]">
        <div className="rounded-[14px] border border-white/10 bg-black/35 p-3">
          <button onClick={onSelect} className="flex w-full items-center justify-between text-left">
            <div>
              <span className="block font-black uppercase tracking-[0.14em]" style={{ color: track.color }}>{track.name}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-white/38">{track.kind} channel</span>
            </div>
            <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-white/45">CH {index + 1}</span>
          </button>
          <div className="mt-3 grid grid-cols-3 gap-1">
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
          <div className="mt-3 relative h-20 overflow-hidden rounded-[12px] border border-white/10 bg-black/55">
            <StudioWaveform color={track.color} row={index} />
            {track.muted ? <div className="absolute inset-0 grid place-items-center bg-black/70 text-xs font-black uppercase tracking-widest text-pink-100">Muted</div> : null}
            {track.solo ? <div className="absolute right-2 top-2 rounded-full border border-yellow-300/40 bg-yellow-300/15 px-2 py-1 text-[9px] font-black uppercase text-yellow-100">Solo</div> : null}
          </div>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-black/28 p-3">
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-white/40">
            <span>Step Rack</span>
            <span>32 steps</span>
          </div>
          <div className="grid grid-cols-8 gap-1 xl:grid-cols-16">
            {pattern.map((on, stepIndex) => (
              <button
                key={stepIndex}
                onClick={() => setPattern((current) => current.map((value, indexValue) => indexValue === stepIndex ? !value : value))}
                className={`relative h-10 rounded-md border transition ${stepIndex % 4 === 0 ? "border-white/16" : "border-white/10"} ${on ? "shadow-[0_0_14px_rgba(255,255,255,.14)]" : ""}`}
                style={{ background: on ? `linear-gradient(180deg, ${track.color}, rgba(7,16,21,.95))` : "rgba(255,255,255,.035)" }}
              >
                <span className="absolute left-1 top-1 text-[8px] font-black text-black/70">{stepIndex + 1}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-white/10 bg-black/32 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/40">Level</div>
          <div className="flex h-full items-end gap-1">
            {level.map((bar, meterIndex) => (
              <span
                key={meterIndex}
                className="w-full rounded-t-sm"
                style={{ height: `${bar}%`, background: `linear-gradient(180deg, ${track.color}, rgba(255,255,255,.08))` }}
              />
            ))}
          </div>
        </div>
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
