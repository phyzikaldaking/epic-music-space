"use client";

import { memo, useMemo, useRef, useState, type WheelEvent } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  playing: boolean;
  bar: number;
};

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const timelineWidth = useMemo(() => Math.round(1180 * zoom), [zoom]);
  const markerStep = useMemo(() => Math.max(72, Math.round(96 * zoom)), [zoom]);
  const cursorX = Math.min(timelineWidth - 24, Math.max(24, bar * markerStep * 0.25));

  function handleWheel(event: WheelEvent<HTMLElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom((value) => Math.min(2.5, Math.max(0.65, Number((value - event.deltaY * 0.0015).toFixed(2)))));
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      viewport.scrollLeft += event.deltaY;
    }
  }

  return (
    <section className="relative min-h-[280px] overflow-hidden rounded-xl border border-white/12 bg-[#071015] [contain:layout_paint]">
      <div className="sticky top-0 z-[4] flex h-8 items-center justify-between border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
        <span>Timeline</span>
        <div className="flex items-center gap-2">
          <span className="text-white/35">Zoom {Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">-</button>
          <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">+</button>
        </div>
      </div>

      <div ref={viewportRef} onWheel={handleWheel} className="ems-scroll relative h-[320px] overflow-auto overscroll-contain">
        <div className="relative min-h-[300px] px-2 py-1" style={{ width: timelineWidth }}>
          <div className="sticky top-0 z-[3] flex h-7 items-center border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
            {Array.from({ length: 16 }, (_, index) => (
              <span key={index} style={{ width: markerStep }} className="shrink-0">{index * 8 + 1}</span>
            ))}
          </div>

          <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)]" style={{ backgroundSize: `${Math.max(32, markerStep / 2)}px 28px` }} />

          <div className="absolute top-8 z-[2] h-[calc(100%-2rem)] w-px bg-yellow-300 shadow-[0_0_22px_#f6d63d] will-change-transform" style={{ transform: `translate3d(${cursorX}px,0,0)` }} />

          <div className="relative z-[1] pt-2">
            {tracks.map((track, row) => (
              <button
                key={track.id}
                onClick={() => setSelectedTrack(track.id)}
                className={`mb-1 flex h-9 items-center overflow-hidden rounded-md border text-left transition-transform duration-150 will-change-transform hover:translate-x-0.5 ${selectedTrack === track.id ? "border-cyan-300/70 bg-cyan-300/8" : "border-white/8 bg-white/[.025]"}`}
                style={{ width: timelineWidth - 16 }}
              >
                <span className="sticky left-0 z-[2] w-28 shrink-0 bg-[#071015]/90 px-2 text-[10px] font-black uppercase tracking-widest backdrop-blur" style={{ color: track.color }}>
                  {track.name}
                </span>

                <div className="relative h-full flex-1">
                  <StudioWaveform color={track.color} row={row} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {playing && (
        <div className="absolute right-3 top-11 rounded-full border border-green-300/35 bg-green-300/10 px-2 py-1 text-[10px] font-black uppercase text-green-200 will-change-transform">
          Playing
        </div>
      )}
    </section>
  );
}

export default memo(StudioTimeline);