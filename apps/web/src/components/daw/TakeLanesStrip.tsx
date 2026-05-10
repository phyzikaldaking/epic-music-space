"use client";

import { useEffect, useRef, useState } from "react";

// COMP_SEGMENT_COUNT in the engine is 8 — the buffer is divided into
// 8 equal slices for comping. Mirror it here so the drag-select math
// maps cleanly onto the engine's segment indices.
const SEGMENTS = 8;

export interface TakeLaneInfo {
  id: string;
  name: string;
  durationSec: number;
  selected: boolean;
}

interface Props {
  /** Each take's render data — id + a normalized peaks array. */
  lanes: Array<{ info: TakeLaneInfo; peaks: number[] }>;
  /** 8-segment array mapping segment index → lane id. Drives the
   *  highlighted region on each take row. */
  compSegmentLaneIds: string[];
  /** Currently active "brush" lane id — drag-select on any take row
   *  assigns those segments to the brush lane (not the lane being
   *  dragged on). Lets you scrub across multiple takes quickly. */
  brushLaneId: string | null;
  /** Live playhead position 0..1 within the take. Drawn as a thin
   *  vertical bar so the user can comp against what's actually playing. */
  progress: number;
  onSetBrushLane: (laneId: string) => void;
  onSetSegmentRange: (startIdx: number, endIdx: number, laneId: string) => void;
  /** Select an entire take (legacy single-lane path). Same callback the
   *  old "Comp lanes" button row used. */
  onSelectLane: (laneId: string) => void;
  /** Rename a take so users can label "Take 2 - softer" etc. */
  onRenameLane?: (laneId: string, name: string) => void;
}

// Per-track strip showing every recorded take as a row with a mini
// waveform. The user picks a brush lane (the take they want to comp
// from) and drag-selects across any other take's waveform — those
// segment indices are assigned to the brush lane via the engine's
// existing setTrackCompSegmentLane API. Visually mirrors how producers
// think about comping ("I want the chorus from take 3, verses from
// take 1") rather than the abstract 8-segment grid.
export default function TakeLanesStrip({
  lanes,
  compSegmentLaneIds,
  brushLaneId,
  progress,
  onSetBrushLane,
  onSetSegmentRange,
  onSelectLane,
  onRenameLane,
}: Props) {
  const [drag, setDrag] = useState<{ laneId: string; startIdx: number; endIdx: number } | null>(
    null,
  );
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
    return () => window.removeEventListener("pointerup", stopDrag);
  }, [drag, brushLaneId, onSetSegmentRange]);

  function segmentFromEvent(e: React.PointerEvent<HTMLDivElement>): number | null {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const rel = (e.clientX - rect.left) / rect.width;
    const idx = Math.floor(rel * SEGMENTS);
    return Math.max(0, Math.min(SEGMENTS - 1, idx));
  }

  if (lanes.length === 0) return null;

  return (
    <div className="rounded-md border border-cyan-400/20 bg-cyan-500/[0.05] px-2.5 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/85">
          Takes · drag-select to comp
        </p>
        <p className="text-[10px] text-cyan-100/55">
          Pick a brush → drag across any take to paint its segments.
        </p>
      </div>
      <div ref={stripRef} className="space-y-1.5">
        {lanes.map(({ info, peaks }) => {
          const isBrush = brushLaneId === info.id;
          return (
            <div key={info.id} className="flex items-center gap-2">
              <div className="flex w-24 shrink-0 flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => onSetBrushLane(info.id)}
                  className={`truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-bold uppercase tracking-wider transition ${
                    isBrush
                      ? "border-amber-300/70 bg-amber-400/20 text-amber-100"
                      : info.selected
                        ? "border-cyan-200/70 bg-cyan-200/20 text-cyan-50"
                        : "border-cyan-300/25 bg-cyan-500/5 text-cyan-100/80 hover:bg-cyan-300/10"
                  }`}
                  title={isBrush ? "Brush active — drag on takes to comp from this one" : "Use this take as the comp source"}
                >
                  {isBrush ? "✎ " : ""}{info.name}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectLane(info.id)}
                  className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10"
                  title="Use this take across the entire track (single-lane select)"
                >
                  All
                </button>
                {onRenameLane && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = window.prompt("Rename take", info.name);
                      if (next && next.trim()) onRenameLane(info.id, next.trim());
                    }}
                    className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/45 hover:bg-white/10"
                  >
                    Rename
                  </button>
                )}
              </div>
              <div
                role="presentation"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!brushLaneId) {
                    onSetBrushLane(info.id);
                    return;
                  }
                  const idx = segmentFromEvent(e);
                  if (idx === null) return;
                  setDrag({ laneId: info.id, startIdx: idx, endIdx: idx });
                }}
                onPointerMove={(e) => {
                  if (!drag) return;
                  const idx = segmentFromEvent(e);
                  if (idx === null) return;
                  // Only re-set drag state when the segment under the
                  // cursor changes. Saves ~95% of pointermove state
                  // updates during a slow drag (one re-render per
                  // segment boundary instead of one per pixel).
                  setDrag((cur) =>
                    cur && cur.endIdx !== idx ? { ...cur, endIdx: idx } : cur,
                  );
                }}
                // touch-action: none lets the strip own pointer events
                // on iOS / Android — without it the OS interprets the
                // drag as a page scroll and the segment selector never
                // fires. cursor-crosshair gives the desktop affordance.
                className={`relative h-12 flex-1 cursor-crosshair overflow-hidden rounded border [touch-action:none] ${
                  isBrush ? "border-amber-300/40" : "border-white/10"
                } bg-black/40`}
              >
                <PeakStrip peaks={peaks} color={isBrush ? "amber" : "cyan"} />
                <SegmentOverlay
                  compSegmentLaneIds={compSegmentLaneIds}
                  thisLaneId={info.id}
                />
                {drag && drag.laneId === info.id && (
                  <DragSelection startIdx={drag.startIdx} endIdx={drag.endIdx} />
                )}
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
  return (
    <div className="absolute inset-0 flex items-center gap-px px-0.5">
      {peaks.map((p, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${fill}`}
          style={{ height: `${Math.max(6, Math.min(100, p * 100))}%` }}
        />
      ))}
    </div>
  );
}

function SegmentOverlay({
  compSegmentLaneIds,
  thisLaneId,
}: {
  compSegmentLaneIds: string[];
  thisLaneId: string;
}) {
  return (
    <div className="absolute inset-0 grid grid-cols-8" aria-hidden>
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const assigned = compSegmentLaneIds[i] === thisLaneId;
        return (
          <div
            key={i}
            className={`border-r border-white/5 last:border-r-0 ${
              assigned ? "bg-emerald-400/15" : ""
            }`}
          />
        );
      })}
    </div>
  );
}

function DragSelection({ startIdx, endIdx }: { startIdx: number; endIdx: number }) {
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const left = (lo / SEGMENTS) * 100;
  const width = ((hi - lo + 1) / SEGMENTS) * 100;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 border border-amber-300/80 bg-amber-300/15"
      style={{ left: `${left}%`, width: `${width}%` }}
    />
  );
}

function PlayheadCaret({ progress }: { progress: number }) {
  if (progress <= 0 || progress >= 1) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white/85"
      style={{ left: `${progress * 100}%` }}
    />
  );
}
