"use client";

import { memo, useEffect, useMemo, useRef, useState, type UIEvent, type WheelEvent } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  playing: boolean;
  bar: number;
};

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 320;
const OVERSCAN = 5;

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [liveBeat, setLiveBeat] = useState(0);
  const timelineWidth = useMemo(() => Math.round(1180 * zoom), [zoom]);
  const markerStep = useMemo(() => Math.max(72, Math.round(96 * zoom)), [zoom]);
  const cursorX = Math.min(timelineWidth - 24, Math.max(24, (bar + liveBeat) * markerStep * 0.25));
  const totalLaneHeight = tracks.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(tracks.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const visibleTracks = useMemo(() => tracks.slice(startIndex, endIndex), [tracks, startIndex, endIndex]);
  const visibleTileStart = Math.max(0, Math.floor(scrollLeft / 240));
  const visibleTileCount = Math.min(8, Math.max(2, Math.ceil((viewportRef.current?.clientWidth ?? 900) / 240) + 2));

  useEffect(() => {
    if (!playing) {
      setLiveBeat(0);
      return;
    }
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      setLiveBeat((frame % 96) / 96);
      const viewport = viewportRef.current;
      if (viewport) {
        const target = Math.max(0, cursorX - viewport.clientWidth * 0.42);
        if (target > viewport.scrollLeft + viewport.clientWidth * 0.68) viewport.scrollLeft = target;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, cursorX]);

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

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    setScrollTop(target.scrollTop);
    setScrollLeft(target.scrollLeft);
  }

  return (
    <section data-testid="studio-moving-timeline" className={`relative min-h-[280px] overflow-visible rounded-xl border border-white/12 bg-[#071015] [contain:layout_paint] ${playing ? "shadow-[0_0_38px_rgba(246,214,61,.14)]" : "shadow-[0_0_22px_rgba(34,211,238,.08)]"}`}>
      <div className="sticky top-0 z-[4] flex h-8 items-center justify-between border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
        <span>Timeline</span>
        <div className="flex items-center gap-2">
          <span className={`${playing ? "text-yellow-200" : "text-white/35"}`}>Beat {bar}.{Math.floor(liveBeat * 4) + 1}</span>
          <span className="text-white/35">Zoom {Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">-</button>
          <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">+</button>
        </div>
      </div>

      <div ref={viewportRef} onWheel={handleWheel} onScroll={handleScroll} className="ems-scroll relative h-[320px] overflow-auto overscroll-auto">
        <div className="relative px-2 py-1" style={{ width: timelineWidth, height: Math.max(300, totalLaneHeight + 48) }}>
          <div className="sticky top-0 z-[3] flex h-7 items-center border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
            {Array.from({ length: 16 }, (_, index) => (
              <span key={index} style={{ width: markerStep }} className="shrink-0">{index * 8 + 1}</span>
            ))}
          </div>

          <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)]" style={{ backgroundSize: `${Math.max(32, markerStep / 2)}px 28px` }} />

          <div data-testid="studio-playhead" className="absolute top-8 z-[5] h-[calc(100%-2rem)] w-[2px] bg-yellow-300 shadow-[0_0_26px_#f6d63d] will-change-transform" style={{ transform: `translate3d(${cursorX}px,0,0)` }}>
            <div className="absolute -left-2 -top-2 h-5 w-5 rounded-full border border-yellow-200 bg-yellow-300 shadow-[0_0_22px_#f6d63d]" />
            <div className="absolute -left-16 top-2 rounded-full border border-yellow-300/35 bg-yellow-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-yellow-100">PLAYHEAD</div>
          </div>

          <div className="absolute left-2 right-2 z-[1]" style={{ top: 40 + startIndex * ROW_HEIGHT }}>
            {visibleTracks.map((track, offset) => {
              const row = startIndex + offset;
              const selected = selectedTrack === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => setSelectedTrack(track.id)}
                  className={`mb-1 flex h-9 items-center overflow-hidden rounded-md border text-left transition-transform duration-150 will-change-transform hover:translate-x-0.5 ${selected ? "border-cyan-300/70 bg-cyan-300/8 shadow-[0_0_18px_rgba(34,211,238,.16)]" : "border-white/8 bg-white/[.025]"}`}
                  style={{ width: timelineWidth - 16 }}
                >
                  <span className="sticky left-0 z-[2] w-28 shrink-0 bg-[#071015]/90 px-2 text-[10px] font-black uppercase tracking-widest backdrop-blur" style={{ color: track.color }}>
                    {track.name}
                  </span>
                  <div className="relative h-full flex-1">
                    <StudioWaveform color={track.color} row={row} tiles={visibleTileCount} tileStart={visibleTileStart} playing={playing || selected} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`absolute right-3 top-11 rounded-full border px-2 py-1 text-[10px] font-black uppercase will-change-transform ${playing ? "animate-pulse border-green-300/35 bg-green-300/10 text-green-200" : "border-white/10 bg-white/[.04] text-white/40"}`}>
        {playing ? "Playing" : "Idle"}
      </div>
    </section>
  );
}

export default memo(StudioTimeline);
