"use client";

import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type UIEvent, type WheelEvent } from "react";
import StudioWaveform from "./StudioWaveform";
import type { StudioClip, StudioRuntimeState, StudioSoundAsset, StudioTrack } from "./studioWorkstationTypes";

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

type CloudRestorePayload = {
  placedClips?: StudioClip[];
  selectedClipId?: string | null;
  selectedTrack?: string | null;
};

const DEFAULT_ROW_HEIGHT = 56;
const COLLAPSED_ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 5;
const PLACED_CLIPS_STORAGE_KEY = "ems-studio-placed-sound-clips";
const SOUNDS_STORAGE_KEY = "ems-studio-sounds";
const DRAG_SOUND_STORAGE_KEY = "ems-studio-drag-sound";

function safeLoadPlacedClips(): StudioClip[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLACED_CLIPS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistPlacedClips(clips: StudioClip[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLACED_CLIPS_STORAGE_KEY, JSON.stringify(clips.slice(-128)));
}

function snapToGrid(seconds: number, bpm: number) {
  const beat = 60 / Math.max(1, bpm);
  const grid = beat / 4;
  return Math.max(0, Number((Math.round(seconds / grid) * grid).toFixed(4)));
}

function createFallbackWaveform(durationSec: number) {
  const total = 96;
  return {
    durationSec,
    peaks: Array.from({ length: total }, (_, index) => {
      const phase = index / total;
      return Math.max(0.08, Math.min(0.95, Math.abs(Math.sin(phase * Math.PI * 8)) * (0.35 + phase * 0.5)));
    }),
  };
}

async function decodeSoundWaveform(sound: StudioSoundAsset) {
  const fallbackDuration = sound.durationSec ?? 4;
  if (typeof window === "undefined") return createFallbackWaveform(fallbackDuration);

  try {
    const response = await fetch(sound.url, { cache: "force-cache" });
    if (!response.ok) throw new Error("Sound fetch failed");
    const arrayBuffer = await response.arrayBuffer();
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive" });
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channel = audio.getChannelData(0);
    const peakCount = 128;
    const blockSize = Math.max(1, Math.floor(channel.length / peakCount));
    const peaks = Array.from({ length: peakCount }, (_, index) => {
      const start = index * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      let max = 0;
      for (let i = start; i < end; i += 1) max = Math.max(max, Math.abs(channel[i] ?? 0));
      return Math.max(0.04, Math.min(1, max));
    });
    await ctx.close().catch(() => undefined);
    return { durationSec: audio.duration, sampleRate: audio.sampleRate, peaks };
  } catch {
    return createFallbackWaveform(fallbackDuration);
  }
}

function loadStoredSound(id: string): StudioSoundAsset | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const dragSoundRaw = window.localStorage.getItem(DRAG_SOUND_STORAGE_KEY);
    if (dragSoundRaw) {
      const dragSound = JSON.parse(dragSoundRaw) as StudioSoundAsset;
      if (dragSound?.id === id) return dragSound;
    }
    const parsed = JSON.parse(window.localStorage.getItem(SOUNDS_STORAGE_KEY) ?? "[]") as StudioSoundAsset[];
    return parsed.find((sound) => sound.id === id);
  } catch {
    return undefined;
  }
}

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar, positionSec = 0, bpm = 92, runtime, selectedClipId, setSelectedClipId, updateTrack }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [zoom, setZoom] = useState(runtime?.zoom ?? 1);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [placedClips, setPlacedClips] = useState<StudioClip[]>(safeLoadPlacedClips);
  const pixelsPerSecond = runtime?.pixelsPerSecond ?? Math.round(72 * zoom);
  const secondsPerBeat = 60 / Math.max(1, bpm);
  const pixelsPerBeat = pixelsPerSecond * secondsPerBeat;
  const markerStep = Math.max(48, pixelsPerBeat * 4);
  const baseClips = runtime?.clips ?? [];
  const baseClipIds = useMemo(() => new Set(baseClips.map((clip) => clip.id)), [baseClips]);
  const clips = useMemo(() => [...baseClips, ...placedClips.filter((clip) => !baseClipIds.has(clip.id))], [baseClipIds, baseClips, placedClips]);
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

  function updatePlacedClip(id: string, patch: Partial<StudioClip>) {
    setPlacedClips((current) => {
      const next = current.map((clip) => clip.id === id ? { ...clip, ...patch } : clip);
      persistPlacedClips(next);
      return next;
    });
  }

  function deletePlacedClip(id: string) {
    const audio = activeAudioRef.current.get(id);
    if (audio) audio.pause();
    activeAudioRef.current.delete(id);
    setPlacedClips((current) => {
      const next = current.filter((clip) => clip.id !== id);
      persistPlacedClips(next);
      return next;
    });
    setSelectedClipId?.(null);
  }

  function duplicatePlacedClip(clip: StudioClip) {
    const copy: StudioClip = {
      ...clip,
      id: `clip-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${clip.name} copy`,
      startSec: snapToGrid(clip.startSec + secondsPerBeat, bpm),
    };
    setPlacedClips((current) => {
      const next = [...current, copy];
      persistPlacedClips(next);
      return next;
    });
    setSelectedClipId?.(copy.id);
  }

  async function placeSoundOnTimeline(sound: StudioSoundAsset, startSec = positionSec, trackId = selectedTrack) {
    const track = tracks.find((item) => item.id === trackId) ?? tracks.find((item) => item.id === selectedTrack) ?? tracks[0];
    if (!track) return;
    const waveform = await decodeSoundWaveform(sound);
    const clip: StudioClip = {
      id: `sound-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      trackId: track.id,
      name: sound.name,
      startSec: snapToGrid(startSec, bpm),
      durationSec: Math.max(0.25, waveform.durationSec || sound.durationSec || 4),
      offsetSec: 0,
      color: track.color,
      waveform,
      audioUrl: sound.url,
      soundAssetId: sound.id,
      muted: false,
      source: sound.source === "generated" ? "generated" : "import",
    };
    setPlacedClips((current) => {
      const next = [...current, clip];
      persistPlacedClips(next);
      return next;
    });
    setSelectedTrack(track.id);
    setSelectedClipId?.(clip.id);
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `Placed ${sound.name} on ${track.name}.` } }));
  }

  useEffect(() => {
    function onPlaceSound(event: Event) {
      const custom = event as CustomEvent<{ sound?: StudioSoundAsset }>;
      if (custom.detail?.sound) void placeSoundOnTimeline(custom.detail.sound, positionSec, selectedTrack);
    }
    window.addEventListener("ems:studio-place-sound", onPlaceSound);
    return () => window.removeEventListener("ems:studio-place-sound", onPlaceSound);
  }, [positionSec, selectedTrack, tracks, bpm]);

  useEffect(() => {
    function onCloudRestore(event: Event) {
      const payload = (event as CustomEvent<CloudRestorePayload>).detail;
      if (!Array.isArray(payload?.placedClips)) return;
      activeAudioRef.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      activeAudioRef.current.clear();
      setPlacedClips(payload.placedClips);
      persistPlacedClips(payload.placedClips);
      if (typeof payload.selectedTrack === "string") setSelectedTrack(payload.selectedTrack);
      if (typeof payload.selectedClipId === "string" || payload.selectedClipId === null) setSelectedClipId?.(payload.selectedClipId ?? null);
      window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `Restored ${payload.placedClips.length} timeline clips from cloud.` } }));
    }
    window.addEventListener("ems:studio-cloud-restored", onCloudRestore);
    return () => window.removeEventListener("ems:studio-cloud-restored", onCloudRestore);
  }, [setSelectedClipId, setSelectedTrack]);

  useEffect(() => {
    if (!playing) {
      activeAudioRef.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      activeAudioRef.current.clear();
      return;
    }

    clips.forEach((clip) => {
      if (!clip.audioUrl || clip.muted) return;
      const clipEnd = clip.startSec + clip.durationSec;
      const active = positionSec >= clip.startSec && positionSec < clipEnd;
      const current = activeAudioRef.current.get(clip.id);

      if (active && !current) {
        const audio = new Audio(clip.audioUrl);
        audio.currentTime = Math.max(0, clip.offsetSec + positionSec - clip.startSec);
        audio.play().catch(() => undefined);
        activeAudioRef.current.set(clip.id, audio);
        return;
      }

      if (active && current) {
        const expected = Math.max(0, clip.offsetSec + positionSec - clip.startSec);
        if (Math.abs(current.currentTime - expected) > 0.35) current.currentTime = expected;
        return;
      }

      if (!active && current) {
        current.pause();
        current.currentTime = 0;
        activeAudioRef.current.delete(clip.id);
      }
    });
  }, [clips, playing, positionSec]);

  useEffect(() => () => {
    activeAudioRef.current.forEach((audio) => audio.pause());
    activeAudioRef.current.clear();
  }, []);

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

  function beginClipMove(event: PointerEvent<HTMLButtonElement>, clip: StudioClip) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId?.(clip.id);
    const startX = event.clientX;
    const originalStart = clip.startSec;
    const onMove = (move: globalThis.PointerEvent) => {
      const deltaSec = (move.clientX - startX) / Math.max(1, pixelsPerSecond);
      updatePlacedClip(clip.id, { startSec: snapToGrid(originalStart + deltaSec, bpm) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function beginClipTrim(event: PointerEvent<HTMLSpanElement>, clip: StudioClip, side: "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedClipId?.(clip.id);
    const startX = event.clientX;
    const originalStart = clip.startSec;
    const originalDuration = clip.durationSec;
    const originalOffset = clip.offsetSec;
    const onMove = (move: globalThis.PointerEvent) => {
      const deltaSec = (move.clientX - startX) / Math.max(1, pixelsPerSecond);
      if (side === "start") {
        const maxStart = originalStart + originalDuration - 0.25;
        const nextStart = snapToGrid(Math.min(maxStart, Math.max(0, originalStart + deltaSec)), bpm);
        const startDelta = Math.max(0, nextStart - originalStart);
        updatePlacedClip(clip.id, {
          startSec: nextStart,
          offsetSec: Math.max(0, originalOffset + startDelta),
          durationSec: Math.max(0.25, originalDuration - startDelta),
        });
      } else {
        updatePlacedClip(clip.id, { durationSec: Math.max(0.25, snapToGrid(originalDuration + deltaSec, bpm)) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("application/x-ems-sound")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const id = event.dataTransfer.getData("application/x-ems-sound");
    if (!id) return;
    event.preventDefault();
    const stored = loadStoredSound(id);
    if (!stored) return;
    const viewport = viewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left + (viewport?.scrollLeft ?? 0) : cursorX;
    const nextStartSec = Math.max(0, x / Math.max(1, pixelsPerSecond));
    void placeSoundOnTimeline(stored, nextStartSec, selectedTrack);
  }

  const beatLabel = Math.max(1, Math.floor(positionSec / Math.max(secondsPerBeat, 0.001)) + 1);

  return (
    <section data-testid="studio-moving-timeline" className={`relative min-h-[360px] overflow-visible rounded-xl border border-white/12 bg-[#071015] [contain:layout_paint] ${playing ? "shadow-[0_0_38px_rgba(246,214,61,.14)]" : "shadow-[0_0_22px_rgba(34,211,238,.08)]"}`}>
      <div className="sticky top-0 z-[4] flex h-9 items-center justify-between border-b border-white/10 bg-[#071015]/95 px-3 text-[10px] uppercase tracking-widest text-white/45 backdrop-blur">
        <span>Timeline · move · trim · duplicate · delete · placed clip playback</span>
        <div className="flex items-center gap-2">
          <span className={`${playing ? "text-yellow-200" : "text-white/35"}`}>Bar {bar} · Beat {beatLabel}</span>
          <span className="text-white/35">{positionSec.toFixed(2)}s</span>
          <span className="text-white/35">Zoom {Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">-</button>
          <button onClick={() => setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))))} className="rounded border border-white/10 px-2 py-1 text-white/55">+</button>
          <button onClick={fitToWindow} className="rounded border border-cyan-300/25 px-2 py-1 text-cyan-100">fit</button>
        </div>
      </div>

      <div ref={viewportRef} onWheel={handleWheel} onScroll={handleScroll} onDragOver={handleDragOver} onDrop={handleDrop} className="ems-scroll relative h-[420px] overflow-auto overscroll-auto">
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
                      const editable = placedClips.some((item) => item.id === clip.id);
                      return (
                        <button
                          key={clip.id}
                          type="button"
                          onPointerDown={(event) => editable ? beginClipMove(event, clip) : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTrack(track.id);
                            setSelectedClipId?.(clip.id);
                          }}
                          data-testid={`studio-clip-${clip.id}`}
                          className={`absolute top-1 bottom-1 overflow-hidden rounded-lg border bg-black/70 text-left shadow-[0_0_16px_rgba(0,0,0,.3)] ${active ? "border-yellow-300/80 ring-2 ring-yellow-300/30" : "border-white/15"}`}
                          style={{ left, width }}
                        >
                          {editable && <span onPointerDown={(event) => beginClipTrim(event, clip, "start")} className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-cyan-300/35" />}
                          {editable && <span onPointerDown={(event) => beginClipTrim(event, clip, "end")} className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize bg-cyan-300/35" />}
                          <div className="flex h-5 items-center justify-between bg-white/[.06] px-2 text-[9px] font-black uppercase tracking-widest text-white/65">
                            <span className="truncate" style={{ color: clip.color ?? track.color }}>{clip.name}</span>
                            {active && editable ? (
                              <span className="flex shrink-0 gap-1">
                                <span onClick={(event) => { event.stopPropagation(); duplicatePlacedClip(clip); }} className="rounded border border-green-300/35 px-1 text-green-100">dup</span>
                                <span onClick={(event) => { event.stopPropagation(); deletePlacedClip(clip.id); }} className="rounded border border-red-300/35 px-1 text-red-100">del</span>
                              </span>
                            ) : <span>{clip.source}</span>}
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
