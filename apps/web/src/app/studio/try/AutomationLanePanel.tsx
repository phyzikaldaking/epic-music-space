"use client";

import { memo, useMemo, useState } from "react";
import type { AutomationLane } from "./studioDawTypes";
import type { StudioTrack } from "./studioWorkstationTypes";

const TARGETS: AutomationLane["target"][] = ["gain", "pan", "filter", "send"];

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
};

function AutomationLanePanel({ tracks, selectedTrack }: Props) {
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [tracks, selectedTrack]);
  const [expanded, setExpanded] = useState(true);
  const [target, setTarget] = useState<AutomationLane["target"]>("gain");
  const [points, setPoints] = useState([{ time: 0, value: 0.72 }, { time: 8, value: 0.9 }, { time: 16, value: 0.42 }, { time: 24, value: 0.78 }]);
  const width = 720;
  const height = expanded ? 220 : 74;
  const maxBeat = 32;

  function pointToXY(point: { time: number; value: number }) {
    return { x: 56 + (point.time / maxBeat) * (width - 86), y: 24 + (1 - point.value) * (height - 54) };
  }

  function updatePoint(index: number, patch: Partial<{ time: number; value: number }>) {
    setPoints((current) => current.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point).sort((a, b) => a.time - b.time));
  }

  return (
    <section className="min-h-[320px] overflow-auto rounded-xl border border-purple-300/20 bg-black/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-purple-200/70">Automation Lane</p>
          <h2 className="text-lg font-black uppercase" style={{ color: selected?.color }}>Automate {selected?.name ?? "Track"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((item) => (
            <button key={item} onClick={() => setTarget(item)} className={`rounded-lg border px-3 py-2 text-xs font-black uppercase ${target === item ? "border-purple-300 bg-purple-300/20 text-purple-100" : "border-white/10 text-white/45"}`}>{item}</button>
          ))}
          <button onClick={() => setExpanded((value) => !value)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-white/55">{expanded ? "Collapse" : "Expand"}</button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-[#080d12] p-2">
        <svg width={width} height={height} className="block min-w-[720px]">
          <defs>
            <linearGradient id="automationGlow" x1="0" x2="1">
              <stop offset="0%" stopColor={selected?.color ?? "#a855f7"} stopOpacity="0.35" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          {Array.from({ length: 9 }, (_, index) => <line key={`v-${index}`} x1={56 + index * 78} x2={56 + index * 78} y1={20} y2={height - 28} stroke="rgba(255,255,255,.08)" />)}
          {Array.from({ length: 5 }, (_, index) => <line key={`h-${index}`} x1={50} x2={width - 24} y1={24 + index * ((height - 54) / 4)} y2={24 + index * ((height - 54) / 4)} stroke="rgba(255,255,255,.08)" />)}
          <polyline fill="none" stroke="url(#automationGlow)" strokeWidth="4" points={points.map(pointToXY).map((p) => `${p.x},${p.y}`).join(" ")} />
          {points.map((point, index) => {
            const p = pointToXY(point);
            return (
              <g key={`${point.time}-${index}`}>
                <circle cx={p.x} cy={p.y} r="9" fill={selected?.color ?? "#a855f7"} stroke="#fff" strokeOpacity="0.7" />
                <foreignObject x={p.x - 40} y={p.y + 12} width="80" height="34">
                  <button onClick={() => updatePoint(index, { value: point.value >= 0.9 ? 0.2 : Math.min(1, point.value + 0.12) })} className="w-full rounded border border-white/10 bg-black/70 px-1 py-1 text-[9px] font-black uppercase text-white/60">{Math.round(point.value * 100)}%</button>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setPoints((current) => [...current, { time: Math.min(maxBeat, current[current.length - 1].time + 4), value: 0.7 }])} className="rounded-lg border border-green-300/25 px-3 py-2 text-xs font-black uppercase text-green-100">Add Point</button>
        <button onClick={() => setPoints((current) => current.slice(0, -1))} className="rounded-lg border border-red-300/25 px-3 py-2 text-xs font-black uppercase text-red-100">Remove Point</button>
        <button onClick={() => setPoints([{ time: 0, value: 0.5 }, { time: 16, value: 0.5 }, { time: 32, value: 0.5 }])} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-black uppercase text-white/55">Flatten</button>
      </div>
    </section>
  );
}

export default memo(AutomationLanePanel);
