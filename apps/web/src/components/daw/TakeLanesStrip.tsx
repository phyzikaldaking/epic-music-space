"use client";

import { useEffect, useRef, useState } from "react";

const SEGMENTS = 8;

export interface TakeLaneInfo {
  id: string;
  name: string;
  durationSec: number;
  selected: boolean;
}

interface Props {
  lanes: Array<{ info: TakeLaneInfo; peaks: number[] }>;
  compSegmentLaneIds: string[];
  brushLaneId: string | null;
  progress: number;
  onSetBrushLane: (laneId: string) => void;
  onSetSegmentRange: (startIdx: number, endIdx: number, laneId: string) => void;
  onSelectLane: (laneId: string) => void;
  onRenameLane?: (laneId: string, name: string) => void;
}

export default function TakeLanesStrip({ lanes, compSegmentLaneIds, brushLaneId, progress, onSetBrushLane, onSetSegmentRange, onSelectLane, onRenameLane }: Props) {
  const [drag, setDrag] = useState<{ laneId: string; startIdx: number; endIdx: number } | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function stopDrag() {
      if (drag && brushLaneId) {
        const lo = Math.min(drag.startIdx, drag.endIdx);
        const hi = Math.max(drag.startIdx, drag.endIdx);
        onSetSegmentRange(lo, hi, brushLaneId);
      }
      setDrag(null);
    }
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [drag, brushLaneId, onSetSegmentRange]);

  function segmentFromEvent(e: React.PointerEvent<HTMLDivElement>): number | null {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const rel = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(SEGMENTS - 1, Math.floor(rel * SEGMENTS)));
  }

  if (lanes.length === 0) return null;

  return (
    <div className="rounded-md border border-cyan-400/20 bg-cyan-500/[0.05] px-2.5 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/85">Takes · drag-select to comp</p>
        <p className="text-[10px] text-cyan-100/55">Pick a brush → drag across any take to paint its segments.</p>
      </div>
      <div ref={stripRef} className="space-y-1.5">
        {lanes.map(({ info, peaks }) => {
          const isBrush = brushLaneId === info.id;
          return (
            <div key={info.id} className="flex items-center gap-2">
              <div className="flex w-24 shrink-0 flex-col gap-0.5">
                <button type="button" onClick={() => onSetBrushLane(info.id)} className={`truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-bold uppercase tracking-wider transition ${isBrush ? "border-amber-300/70 bg-amber-400/20 text-amber-100" : info.selected ? "border-cyan-200/70 bg-cyan-200/20 text-cyan-50" : "border-cyan-300/25 bg-cyan-500/5 text-cyan-100/80 hover:bg-cyan-300/10"}`} title={isBrush ? "Brush active — drag on takes to comp from this one" : "Use this take as the comp source"}>{isBrush ? "✎ " : ""}{info.name}</button>
                <button type="button" onClick={() => onSelectLane(info.id)} className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10" title="Use this take across the entire track">All</button>
                {onRenameLane && <button type="button" onClick={() => { const next = window.prompt("Rename take", info.name); if (next && next.trim()) onRenameLane(info.id, next.trim()); }} className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45 hover:bg-white/10">Rename</button>}
              </div>
              <div
                role="presentation"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  const idx = segmentFromEvent(e);
                  if (idx === null) return;
                  if (!brushLaneId) onSetBrushLane(info.id);
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setDrag({ laneId: info.id, startIdx: idx, endIdx: idx });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.laneId !== info.id) return;
                  const idx = segmentFromEvent(e);
                  if (idx === null) return;
                  setDrag((cur) => (cur && cur.endIdx !== idx ? { ...cur, endIdx: idx } : cur));
                }}
                className={`relative h-12 flex-1 cursor-crosshair overflow-hidden rounded border select-none [touch-action:pan-y] ${isBrush ? "border-amber-300/40" : "border-white/10"} bg-black/40`}
              >
                <PeakStrip peaks={peaks} color={isBrush ? "amber" : "cyan"} />
                <SegmentOverlay compSegmentLaneIds={compSegmentLaneIds} thisLaneId={info.id} />
                {drag && drag.laneId === info.id && <DragSelection startIdx={drag.startIdx} endIdx={drag.endIdx} />}
                <PlayheadCaret progress={progress} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PeakStrip({ peaks, color }: { peaks: number[]; color: "amber" | "cyan" }) {
  const fill = color === "amber" ? "bg-amber-300/65" : "bg-cyan-300/55";
  return <div className="pointer-events-none absolute inset-0 flex items-center gap-px px-0.5">{peaks.map((p, i) => <div key={i} className={`flex-1 rounded-sm ${fill}`} style={{ height: `${Math.max(6, Math.min(100, p * 100))}%` }} />)}</div>;
}

function SegmentOverlay({ compSegmentLaneIds, thisLaneId }: { compSegmentLaneIds: string[]; thisLaneId: string }) {
  return <div className="pointer-events-none absolute inset-0 grid grid-cols-8" aria-hidden>{Array.from({ length: SEGMENTS }, (_, i) => <div key={i} className={`border-r border-white/5 last:border-r-0 ${compSegmentLaneIds[i] === thisLaneId ? "bg-emerald-400/15" : ""}`} />)}</div>;
}

function DragSelection({ startIdx, endIdx }: { startIdx: number; endIdx: number }) {
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  return <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 border border-amber-300/80 bg-amber-300/15" style={{ left: `${(lo / SEGMENTS) * 100}%`, width: `${((hi - lo + 1) / SEGMENTS) * 100}%` }} />;
}

function PlayheadCaret({ progress }: { progress: number }) {
  if (progress <= 0 || progress >= 1) return null;
  return <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white/85" style={{ left: `${progress * 100}%` }} />;
}
