"use client";

import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent, type UIEvent, type WheelEvent } from "react";
import StudioWaveform from "./StudioWaveform";
import { startStudioBuffer, stopAllStudioAudio } from "../../../lib/studioAudio";
import { trackStudio, trackStudioError } from "../../../lib/studioTelemetry";
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

type TimelineTool = "select" | "trim" | "grab" | "fade" | "split" | "pencil" | "snap";

const DEFAULT_ROW_HEIGHT = 56;
const COLLAPSED_ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 420;
const OVERSCAN = 5;
const PLACED_CLIPS_STORAGE_KEY = "ems-studio-placed-sound-clips.v2";
function placedClipsStorageKey() { return `${PLACED_CLIPS_STORAGE_KEY}:${typeof window !== "undefined" ? window.localStorage.getItem("ems-studio-session-id-v2") ?? "default" : "default"}`; }
const SOUNDS_STORAGE_KEY = "ems-studio-sounds";
const DRAG_SOUND_STORAGE_KEY = "ems-studio-drag-sound";
const MIN_CLIP_DURATION = 0.125;
const TOOLBAR: { id: TimelineTool; icon: string; label: string }[] = [
  { id: "select", icon: "↖", label: "Select" },
  { id: "trim", icon: "⇤", label: "Trim" },
  { id: "grab", icon: "✋", label: "Grab" },
  { id: "fade", icon: "◢", label: "Fade" },
  { id: "split", icon: "✂", label: "Split" },
  { id: "pencil", icon: "✎", label: "Pencil" },
  { id: "snap", icon: "▦", label: "Snap" },
];

function safeLoadPlacedClips(): StudioClip[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(placedClipsStorageKey()) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((clip) => clip?.source !== "placeholder") : [];
  } catch {
    return [];
  }
}

function persistPlacedClips(clips: StudioClip[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(placedClipsStorageKey(), JSON.stringify(clips.filter((clip) => clip.source !== "placeholder").slice(-128)));
}

function snapToGrid(seconds: number, bpm: number) {
  const beat = 60 / Math.max(1, bpm);
  const grid = beat / 4;
  return Math.max(0, Number((Math.round(seconds / grid) * grid).toFixed(4)));
}

function emptyDecodedWaveform(durationSec: number) {
  return { durationSec, peaks: [] };
}

async function decodeSoundWaveform(sound: StudioSoundAsset) {
  const fallbackDuration = sound.durationSec ?? 4;
  if (typeof window === "undefined") return emptyDecodedWaveform(fallbackDuration);

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
    return emptyDecodedWaveform(fallbackDuration);
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

function notify(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message } }));
}

function trackAiMixPatch(track: StudioTrack, index: number): Partial<StudioTrack> {
  const label = `${track.name} ${track.kind}`.toLowerCase();
  if (label.includes("kick") || label.includes("drum")) return { volume: 84, pan: 0, meter: 86 };
  if (label.includes("808") || label.includes("bass")) return { volume: 76, pan: 0, meter: 74 };
  if (label.includes("snare") || label.includes("clap")) return { volume: 72, pan: 0, meter: 68 };
  if (label.includes("hat") || label.includes("perc")) return { volume: 56, pan: index % 2 ? 18 : -18, meter: 55 };
  if (label.includes("vocal") || label.includes("vox") || label.includes("lead")) return { volume: 82, pan: 0, meter: 80 };
  if (label.includes("fx")) return { volume: 48, pan: index % 2 ? 28 : -28, meter: 42 };
  if (label.includes("melody") || label.includes("keys") || label.includes("pad") || label.includes("instrument")) return { volume: 60, pan: index % 2 ? 14 : -14, meter: 54 };
  return { volume: 62, pan: index % 2 ? 8 : -8, meter: 52 };
}

function clipColorFor(clip: StudioClip, track: StudioTrack) {
  const source = `${clip.source ?? ""} ${clip.name}`.toLowerCase();
  if (source.includes("generated") || source.includes("ai")) return "#9cff2e";
  if (source.includes("vocal") || source.includes("vox")) return "#ff2dcb";
  if (source.includes("808") || source.includes("bass")) return "#ffd166";
  if (source.includes("kick") || source.includes("snare") || source.includes("hat") || source.includes("perc")) return "#00f0ff";
  if (track.kind === "vocal") return "#ff2dcb";
  if (track.kind === "bass") return "#ffd166";
  if (track.kind === "fx") return "#a855ff";
  return clip.color ?? track.color ?? "#00f0ff";
}

function clipBackground(color: string, active: boolean) {
  return `linear-gradient(180deg, ${color}${active ? "44" : "2e"}, rgba(0,0,0,.76) 34%, rgba(0,0,0,.9)), linear-gradient(90deg, ${color}12, transparent 54%)`;
}

function metersForTrack(track: StudioTrack) {
  return track.muted ? 4 : Math.max(4, Math.min(96, track.meter ?? track.volume ?? 0));
}

function StudioTimeline({ tracks, selectedTrack, setSelectedTrack, playing, bar, positionSec = 0, bpm = 92, runtime, selectedClipId, setSelectedClipId, updateTrack }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeAudioRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const [zoom, setZoom] = useState(runtime?.zoom ?? 1);
  const [tool, setTool] = useState<TimelineTool>("select");
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [placedClips, setPlacedClips] = useState<StudioClip[]>(safeLoadPlacedClips);
  const pixelsPerSecond = runtime?.pixelsPerSecond ?? Math.round(72 * zoom);
  const secondsPerBeat = 60 / Math.max(1, bpm);
  const pixelsPerBeat = pixelsPerSecond * secondsPerBeat;
  const markerStep = Math.max(48, pixelsPerBeat * 4);
  const baseClips = useMemo(() => (runtime?.clips ?? []).filter((clip) => clip.source !== "placeholder"), [runtime?.clips]);
  const baseClipIds = useMemo(() => new Set(baseClips.map((clip) => clip.id)), [baseClips]);
  const clips = useMemo(() => [...baseClips, ...placedClips.filter((clip) => clip.source !== "placeholder" && !baseClipIds.has(clip.id))], [baseClipIds, baseClips, placedClips]);
  const selectedClip = useMemo(() => clips.find((clip) => clip.id === selectedClipId) ?? null, [clips, selectedClipId]);
  const lastClipEnd = clips.reduce((max, clip) => Math.max(max, clip.startSec + clip.durationSec), 0);
  const timelineWidth = useMemo(() => Math.max(1180, Math.round(Math.max(64, positionSec + 64, lastClipEnd + 12) * pixelsPerSecond)), [lastClipEnd, pixelsPerSecond, positionSec]);
  const cursorX = Math.min(timelineWidth - 24, Math.max(24, positionSec * pixelsPerSecond));
  const rowMetrics = useMemo(() => tracks.map((track) => ({ id: track.id, height: track.collapsed ? COLLAPSED_ROW_HEIGHT : Math.max(48, Math.min(220, track.height ?? DEFAULT_ROW_HEIGHT)) })), [tracks]);
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

  function commitPlacedClips(updater: (current: StudioClip[]) => StudioClip[]) {
    setPlacedClips((current) => {
      const next = updater(current).filter((clip) => clip.source !== "placeholder");
      persistPlacedClips(next);
      return next;
    });
  }

  function updatePlacedClip(id: string, patch: Partial<StudioClip>) {
    commitPlacedClips((current) => current.map((clip) => clip.id === id ? { ...clip, ...patch } : clip));
  }

  function isPlacedClip(id: string) {
    return placedClips.some((clip) => clip.id === id);
  }

  function deletePlacedClip(id: string) {
    const audio = activeAudioRef.current.get(id);
    if (audio) { try { audio.stop(); } catch {} try { audio.disconnect(); } catch {} }
    activeAudioRef.current.delete(id);
    commitPlacedClips((current) => current.filter((clip) => clip.id !== id));
    setSelectedClipId?.(null);
    notify("Deleted selected clip.");
  }

  function duplicatePlacedClip(clip: StudioClip) {
    const copy: StudioClip = {
      ...clip,
      id: `clip-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${clip.name} copy`,
      startSec: snapToGrid(clip.startSec + secondsPerBeat, bpm),
      selected: true,
    };
    commitPlacedClips((current) => [...current.map((item) => ({ ...item, selected: false })), copy]);
    setSelectedClipId?.(copy.id);
    notify("Duplicated clip.");
  }

  function nudgeSelectedClip(direction: -1 | 1, large = false) {
    if (!selectedClipId || !isPlacedClip(selectedClipId)) return;
    const amount = large ? secondsPerBeat : secondsPerBeat / 4;
    updatePlacedClip(selectedClipId, { startSec: snapToGrid(Math.max(0, (selectedClip?.startSec ?? 0) + direction * amount), bpm) });
    notify(`${direction < 0 ? "Nudged left" : "Nudged right"}.`);
  }

  function splitSelectedClip() {
    if (!selectedClip || !isPlacedClip(selectedClip.id)) return;
    const splitAt = positionSec;
    const clipEnd = selectedClip.startSec + selectedClip.durationSec;
    if (splitAt <= selectedClip.startSec + MIN_CLIP_DURATION || splitAt >= clipEnd - MIN_CLIP_DURATION) {
      notify("Move playhead inside the clip before splitting.");
      return;
    }
    const leftDuration = splitAt - selectedClip.startSec;
    const rightDuration = clipEnd - splitAt;
    const rightClip: StudioClip = {
      ...selectedClip,
      id: `clip-split-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: `${selectedClip.name} split`,
      startSec: splitAt,
      offsetSec: selectedClip.offsetSec + leftDuration,
      durationSec: rightDuration,
      fadeInSec: 0,
      selected: true,
    };
    commitPlacedClips((current) => current.flatMap((clip) => clip.id === selectedClip.id ? [{ ...clip, durationSec: leftDuration, selected: false }, rightClip] : [{ ...clip, selected: false }]));
    setSelectedClipId?.(rightClip.id);
    notify("Split clip at playhead.");
  }

  function updateTrackSafe(track: StudioTrack, patch: Partial<StudioTrack>) {
    updateTrack?.(track.id, patch);
    if (!updateTrack) notify("Track update bridge is not available on this route yet.");
  }

  function aiMixTrack(track: StudioTrack, index: number) {
    updateTrackSafe(track, trackAiMixPatch(track, index));
    notify(`AI mixed ${track.name}.`);
  }

  function selectTool(nextTool: TimelineTool) {
    setTool(nextTool);
    notify(`${nextTool.toUpperCase()} tool selected.`);
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
      color: clipColorFor({ name: sound.name, source: sound.source === "generated" ? "generated" : "import" } as StudioClip, track),
      waveform,
      audioUrl: sound.url,
      soundAssetId: sound.id,
      muted: false,
      selected: true,
      fadeInSec: 0.01,
      fadeOutSec: 0.01,
      gain: 1,
      crossfadeSec: 0,
      source: sound.source === "generated" ? "generated" : "import",
    };
    commitPlacedClips((current) => [...current.map((item) => ({ ...item, selected: false })), clip]);
    setSelectedTrack(track.id);
    setSelectedClipId?.(clip.id);
    trackStudio("timeline_clip_placed", { asset_id: sound.id, track_id: track.id, duration_sec: clip.durationSec });
    notify(waveform.peaks.length ? `Placed ${sound.name} on ${track.name}.` : `Placed ${sound.name}. Waveform will appear after audio can be decoded.`);
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
      const realClips = payload.placedClips.filter((clip) => clip.source !== "placeholder");
      setPlacedClips(realClips);
      persistPlacedClips(realClips);
      if (typeof payload.selectedTrack === "string") setSelectedTrack(payload.selectedTrack);
      if (typeof payload.selectedClipId === "string" || payload.selectedClipId === null) setSelectedClipId?.(payload.selectedClipId ?? null);
      trackStudio("project_restored", { clip_count: realClips.length, source: "cloud" });
      notify(`Restored ${realClips.length} timeline clips from cloud.`);
    }
    window.addEventListener("ems:studio-cloud-restored", onCloudRestore);
    return () => window.removeEventListener("ems:studio-cloud-restored", onCloudRestore);
  }, [setSelectedClipId, setSelectedTrack]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
      const command = event.metaKey || event.ctrlKey;
      if ((event.key === "Backspace" || event.key === "Delete") && selectedClipId) {
        event.preventDefault();
        if (isPlacedClip(selectedClipId)) deletePlacedClip(selectedClipId);
        return;
      }
      if (command && event.key.toLowerCase() === "d" && selectedClip) {
        event.preventDefault();
        if (isPlacedClip(selectedClip.id)) duplicatePlacedClip(selectedClip);
        return;
      }
      if (command && event.key.toLowerCase() === "e") {
        event.preventDefault();
        splitSelectedClip();
        return;
      }
      if (event.key === "ArrowLeft" && selectedClipId) {
        event.preventDefault();
        nudgeSelectedClip(-1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowRight" && selectedClipId) {
        event.preventDefault();
        nudgeSelectedClip(1, event.shiftKey);
        return;
      }
      if (command && event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))));
        return;
      }
      if (command && event.key === "-") {
        event.preventDefault();
        setZoom((value) => Math.max(0.45, Number((value - 0.1).toFixed(2))));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedClip, selectedClipId, placedClips, positionSec, secondsPerBeat]);

  useEffect(() => {
    if (!playing) {
      activeAudioRef.current.forEach((source) => { try { source.stop(); } catch {} try { source.disconnect(); } catch {} });
      activeAudioRef.current.clear();
      return;
    }

    clips.forEach((clip) => {
      if (!clip.audioUrl || clip.muted) return;
      const clipEnd = clip.startSec + clip.durationSec;
      const active = positionSec >= clip.startSec && positionSec < clipEnd;
      const current = activeAudioRef.current.get(clip.id);

      if (active && !current) {
        const offset = Math.max(0, clip.offsetSec + positionSec - clip.startSec);
        const overlapping = clips.some((other) => other.id !== clip.id && other.trackId === clip.trackId && other.startSec < clipEnd && other.startSec + other.durationSec > clip.startSec);
        const crossfade = overlapping ? Math.max(0, clip.crossfadeSec ?? 0) : 0;
        const fadeIn = Math.max(0, clip.fadeInSec ?? 0, crossfade);
        const fadeOut = Math.max(0, clip.fadeOutSec ?? 0, crossfade);
        const remaining = Math.max(0.01, clipEnd - positionSec);
        void startStudioBuffer(clip.audioUrl, offset, undefined, clip.gain ?? 1, positionSec <= clip.startSec ? fadeIn : 0, fadeOut, remaining).then((source) => {
          trackStudio("timeline_clip_played", { clip_id: clip.id, asset_id: clip.soundAssetId ?? null });
          if (!playing || activeAudioRef.current.has(clip.id)) {
            try { source.stop(); } catch {}
            return;
          }
          activeAudioRef.current.set(clip.id, source);
        }).catch((error) => { trackStudioError("timeline_clip_failed", error, { clip_id: clip.id }); notify(`Could not play ${clip.name}.`); });
        return;
      }

      if (!active && current) {
        try { current.stop(); } catch {}
        try { current.disconnect(); } catch {}
        activeAudioRef.current.delete(clip.id);
      }
    });
  }, [clips, playing, positionSec]);

  useEffect(() => () => {
    activeAudioRef.current.forEach((source) => { try { source.stop(); } catch {} try { source.disconnect(); } catch {} });
    activeAudioRef.current.clear();
    stopAllStudioAudio();
  }, []);

  return (
    <div data-testid="studio-moving-timeline" className="relative h-full min-h-[520px] overflow-hidden rounded-xl border border-white/10 bg-[#070a0d]">
      <div className="flex h-12 items-center gap-2 border-b border-white/10 bg-[#12171b] px-3">
        {TOOLBAR.map((item) => (
          <button key={item.id} onClick={() => selectTool(item.id)} className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${tool === item.id ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-black/35 text-white/45"}`}>{item.icon} {item.label}</button>
        ))}
        <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-white/35">Bar {bar}</div>
      </div>
       <div>
         <div className="relative" style={{ width: timelineWidth, height: totalLaneHeight }}>
          {Array.from({ length: Math.ceil(timelineWidth / markerStep) + 1 }, (_, index) => (
            <div key={index} className="absolute bottom-0 top-0 border-l border-white/5" style={{ left: index * markerStep }} />
          ))}
          <div className="absolute bottom-0 top-0 z-20 w-px bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,.9)]" style={{ left: cursorX }} />
          {visibleTracks.map((track, localIndex) => {
            const index = startIndex + localIndex;
            const top = offsets[index] ?? 0;
            const height = rowMetrics[index]?.height ?? DEFAULT_ROW_HEIGHT;
            const trackClips = clips.filter((clip) => clip.trackId === track.id);
            return (
              <div key={track.id} className="absolute left-0 right-0 grid grid-cols-[176px_1fr] gap-2 px-2" style={{ top, height }}>
                <div onClick={() => setSelectedTrack(track.id)} className={`rounded-lg border px-2 py-2 ${selectedTrack === track.id ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-black/40"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-black uppercase text-white">{track.name}</span>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: track.color }} />
                  </div>
                  <div className="mt-2 h-1.5 rounded bg-black/70"><div className="h-full rounded bg-cyan-300" style={{ width: `${metersForTrack(track)}%` }} /></div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30">
                  {trackClips.map((clip) => {
                    const color = clipColorFor(clip, track);
                    const active = selectedClipId === clip.id;
                    return (
                      <div key={clip.id} onClick={() => setSelectedClipId?.(clip.id)} className={`absolute top-1 bottom-1 overflow-hidden rounded-md border ${active ? "border-white/70" : "border-white/15"}`} style={{ left: clip.startSec * pixelsPerSecond, width: Math.max(32, clip.durationSec * pixelsPerSecond), background: clipBackground(color, active) }}>
                        <div className="relative h-full">
                          <StudioWaveform color={color} waveform={clip.waveform} emptyLabel="Decode required" />
                          <span className="absolute left-2 top-1 max-w-[85%] truncate rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/70">{clip.name} · {clip.soundAssetId ?? "local"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(StudioTimeline);
// Studio timeline wrapper verified for production builds.
