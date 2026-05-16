"use client";

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent, type UIEvent, type WheelEvent } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioClip, StudioRuntimeState, StudioTrack } from "./studioWorkstationTypes";

type Props = {
  tracks: StudioTrack[];
  selectedTrack: string;
  setSelectedTrack: (id: string) => void;
  playing: boolean;
  bar: number;
  positionSec?: number;
  bpm?: number;
  runtime?: StudioRuntimeState;
  selectedClipId?: string | null;
  setSelectedClipId?: (id: string | null) => void;
  updateTrack?: (id: string, patch: Partial<StudioTrack>) => void;
};

const DEFAULT_ROW_HEIGHT = 56;
const COLLAPSED_ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 5;

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar, positionSec = 0, bpm = 92, runtime, selectedClipId, setSelectedClipId, updateTrack }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(runtime?.zoom ?? 1);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const pixelsPerSecond = runtime?.pixelsPerSecond ?? Math.round(72 * zoom);
  const secondsPerBeat = 60 / Math.max(1, bpm);
  const pixelsPerBeat = pixelsPerSecond * secondsPerBeat;
  const markerStep = Math.max(48, pixelsPerBeat * 4);
  const clips = runtime?.clips ?? [];
  const lastClipEnd = clips.reduce((max, clip) => Math.max(max, clip.startSec + clip.durationSec), 0);
  const timelineWidth = useMemo(() => Math.max(1180, Math.round(Math.max(64, positionSec + 64, lastClipEnd + 12) * pixelsPerSecond)), [lastClipEnd, pixelsPerSecond, positionSec]);
  const cursorX = Math.min(timelineWidth - 24, Math.max(24, positionSec * pixelsPerSecond));
  const rowMetrics = useMemo(() => tracks.map((track) => ({ id: track.id, height: track.collapsed ? COLLAPSED_ROW_HEIGHT : Math.max(36, Math.min(220, track.height ?? DEFAULT_ROW_HEIGHT)) })), [tracks]);
  const offsets = useMemo(() => {
    let top = 0;
    return rowMetrics.map((row) => {
      const current = top;
      top += row.height + 6;
      return current;
    });
  }, [rowMetrics]);
  const totalLaneHeight = offsets.length ? offsets[offsets.length - 1] + rowMetrics[rowMetrics.length - 1].height + 64 : 360;
  const startIndex = Math.max(0, rowMetrics.findIndex((_, index) => (offsets[index] ?? 0) + rowMetrics[index].height >= scrollTop) - OVERSCAN);
  const endProbe = rowMetrics.findIndex((_, index) => (offsets[index] ?? 0) > scrollTop + VIEWPORT_HEIGHT);
  const safeEndIndex = Math.min(tracks.length, endProbe < 0 ? tracks.length : Math.max(startIndex + 1, endProbe + OVERSCAN));
  const visibleTracks = useMemo(() => tracks.slice(startIndex, safeEndIndex), [tracks, startIndex, safeEndIndex]);
  const visibleTileStart = Math.max(0, Math.floor(scrollLeft / 240));
  const visibleTileCount = Math.min(8, Math.max(2, Math.ceil((viewportRef.current?.clientWidth ?? 900) / 240) + 2));

  useEffect(() => {
    if (!playing) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const target = Math.max(0, cursorX - viewport.clientWidth * 0.42);
    if (cursorX > viewport.scrollLeft + viewport.clientWidth * 0.72 || cursorX < viewport.scrollLeft + viewport.clientWidth * 0.12) viewport.scrollLeft = target;
  }, [playing, cursorX]);

  function handleWheel(event: WheelEvent<HTMLElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      setZoom((value) => Math.min(3, Math.max(0.45, Number((value - event.deltaY * 0.0015).toFixed(2)))));
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

  function fitToWindow() {
    const viewport = viewportRef.current;
    const width = viewport?.clientWidth ?? 1180;
    setZoom(Math.max(0.45, Math.min(1.5, Number((width / 1280).toFixed(2)))));
    if (viewport) viewport.scrollLeft = Math.max(0, cursorX - width * 0.35);
  }

  function beginResize(event: PointerEvent<HTMLDivElement>, track: StudioTrack) {
    if (!updateTrack) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = track.height ?? DEFAULT_ROW_HEIGHT;
    const onMove = (move: globalThis.PointerEvent) => {
      const next = Math.max(36, Math.min(220, Math.round(startHeight + move.clientY - startY)));
      updateTrack(track.id, { height: next, collapsed: false });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const beatLabel = Math.max(1, Math.floor(positionSec / Math.max(secondsPerBeat, 0.001)) + 1);

  return (
    <section data-testid="studio-moving-timeline" className={`relative min-h-[360px] overflow-visible rounded-xl border border-white/12 bg-[#071015] [contain:layout_paint] ${playing ? "shadow-[0_0_38px_rgba(246,214,61,.14)]" : "shadow-[0_0_22px_rgba(34,211,238,.08)]"}`}>
      <div className="sticky top-0 z-[4] flex h-9 items-center justify-between border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
        <span>Engine-bound timeline · clips</span>
        <div className="flex items-center gap-2">
          <span className={`${playing ? "text-yellow-200" : "text-white/35"}`}>Bar {bar} · Beat {beatLabel}</span>
          <span className="text-white/35">{positionSec.toFixed(2)}s</span>
          <span className="text-white/35">Zoom {Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">-</button>
          <button onClick={() => setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">+</button>
          <button onClick={fitToWindow} className="rounded border border-cyan-300/25 px-2 py-1 text-cyan-100">fit</button>
        </div>
      </div>

      <div ref={viewportRef} onWheel={handleWheel} onScroll={handleScroll} className="ems-scroll relative h-[420px] overflow-auto overscroll-auto">
        <div className="relative px-2 py-1" style={{ width: timelineWidth, height: Math.max(380, totalLaneHeight) }}>
          <div className="sticky top-0 z-[3] flex h-7 items-center border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
            {Array.from({ length: Math.ceil(timelineWidth / markerStep) + 2 }, (_, index) => <span key={index} style={{ width: markerStep }} className="shrink-0">{index + 1}</span>)}
          </div>

          <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.07)_1px,transparent_1px)]" style={{ backgroundSize: `${Math.max(24, pixelsPerBeat)}px 28px` }} />

          <div data-testid="studio-playhead" data-playhead-source="transport-position-sec" className="absolute top-8 z-[8] h-[calc(100%-2rem)] w-[2px] bg-yellow-300 shadow-[0_0_26px_#f6d63d] will-change-transform" style={{ transform: `translate3d(${cursorX}px,0,0)` }}>
            <div className="absolute -left-2 -top-2 h-5 w-5 rounded-full border border-yellow-200 bg-yellow-300 shadow-[0_0_22px_#f6d63d]" />
            <div className="absolute -left-16 top-2 rounded-full border border-yellow-300/35 bg-yellow-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-yellow-100">REAL TIME</div>
          </div>

          <div className="absolute left-2 right-2 z-[1]" style={{ top: 40 + (offsets[startIndex] ?? 0) }}>
            {visibleTracks.map((track, offset) => {
              const absoluteIndex = startIndex + offset;
              const row = absoluteIndex;
              const selected = selectedTrack === track.id;
              const rowHeight = rowMetrics[absoluteIndex]?.height ?? DEFAULT_ROW_HEIGHT;
              const trackClips = clips.filter((clip) => clip.trackId === track.id);
              return (
                <div
                  key={track.id}
                  onClick={() => setSelectedTrack(track.id)}
                  className={`group relative mb-1 flex items-center overflow-hidden rounded-md border text-left transition-transform duration-150 will-change-transform hover:translate-x-0.5 ${selected ? "border-cyan-300/70 bg-cyan-300/8 shadow-[0_0_18px_rgba(34,211,238,.16)]" : "border-white/8 bg-white/[.025]"}`}
                  style={{ width: timelineWidth - 16, height: rowHeight }}
                >
                  <span className="sticky left-0 z-[4] h-full w-32 shrink-0 border-r border-white/10 bg-[#071015]/95 px-2 py-2 text-[10px] font-black uppercase tracking-widest backdrop-blur" style={{ color: track.color }}>
                    {track.name}<span className="block text-[8px] text-white/35">{track.kind}</span>
                  </span>
                  <div className="relative h-full flex-1">
                    {!track.collapsed && trackClips.length === 0 ? <StudioWaveform color={track.color} row={row} tiles={visibleTileCount} tileStart={visibleTileStart} playing={playing || selected} waveform={track.waveform} /> : null}
                    {!track.collapsed && trackClips.map((clip: StudioClip) => {
                      const left = Math.max(0, clip.startSec * pixelsPerSecond);
                      const width = Math.max(48, clip.durationSec * pixelsPerSecond);
                      const active = selectedClipId === clip.id;
                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTrack(track.id);
                            setSelectedClipId?.(clip.id);
                          }}
                          data-testid={`studio-clip-${clip.id}`}
                          className={`absolute top-1 bottom-1 overflow-hidden rounded-lg border bg-black/70 text-left shadow-[0_0_16px_rgba(0,0,0,.3)] ${active ? "border-yellow-300/80 ring-2 ring-yellow-300/30" : "border-white/15"}`}
                          style={{ left, width }}
                        >
                          <div className="flex h-5 items-center justify-between bg-white/[.06] px-2 text-[9px] font-black uppercase tracking-widest text-white/65">
                            <span className="truncate" style={{ color: clip.color ?? track.color }}>{clip.name}</span>
                            <span>{clip.source}</span>
                          </div>
                          <div className="relative h-[calc(100%-1.25rem)]">
                            <StudioWaveform color={clip.color ?? track.color} row={row} playing={playing || active} waveform={clip.waveform} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div onPointerDown={(event) => beginResize(event, track)} className="absolute bottom-0 left-32 right-0 z-[5] h-2 cursor-ns-resize bg-transparent group-hover:bg-cyan-300/25" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className={`absolute right-3 top-12 rounded-full border px-2 py-1 text-[10px] font-black uppercase will-change-transform ${playing ? "animate-pulse border-green-300/35 bg-green-300/10 text-green-200" : "border-white/10 bg-white/[.04] text-white/40"}`}>
        {playing ? "Playing" : "Idle"}
      </div>
    </section>
  );
}

export default memo(StudioTimeline);
