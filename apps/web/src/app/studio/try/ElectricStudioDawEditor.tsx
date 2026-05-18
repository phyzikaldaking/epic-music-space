"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EditMode = "slip" | "grid" | "shuffle" | "spot";
type TrackKind = "audio" | "aux" | "master";
type DragMode = "move" | "trimStart" | "trimEnd" | "fadeIn" | "fadeOut";
type Clip = {
  id: string;
  name: string;
  url: string;
  type: string;
  duration: number;
  start: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
  muted: boolean;
  locked: boolean;
  color: string;
  peaks: number[];
  groupId?: string | null;
};
type Track = {
  id: string;
  kind: TrackKind;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  clips: Clip[];
};

type DragState = {
  clipId: string;
  trackId: string;
  mode: DragMode;
  startX: number;
  originalStart: number;
  originalTrimStart: number;
  originalTrimEnd: number;
  originalFadeIn: number;
  originalFadeOut: number;
  originalGroupStarts: Record<string, number>;
};

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e"];
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const gridValue = 0.25;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function visibleDuration(clip: Clip) {
  return Math.max(0.05, clip.duration - clip.trimStart - clip.trimEnd);
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function makeTrack(kind: TrackKind, index: number, armed = false): Track {
  const color = kind === "master" ? "#d8d2bd" : colors[index % colors.length];
  return {
    id: uid("track"),
    kind,
    name: kind === "audio" ? `Audio ${index + 1}` : kind === "aux" ? `Aux ${index + 1}` : "Master",
    color,
    armed: kind === "audio" && armed,
    muted: false,
    solo: false,
    volume: kind === "master" ? 85 : 78,
    pan: 0,
    clips: [],
  };
}

function snapTime(value: number, editMode: EditMode) {
  if (editMode !== "grid") return Math.max(0, value);
  return Math.max(0, Math.round(value / gridValue) * gridValue);
}

function gainPercent(gain: number) {
  return Math.max(10, Math.min(90, 55 - gain * 1.55));
}

async function decodeFile(file: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const count = 1200;
    const block = Math.max(1, Math.floor(buffer.length / count));
    const peaks = Array.from({ length: count }, (_, index) => {
      let max = 0;
      const start = index * block;
      const end = Math.min(buffer.length, start + block);
      for (let i = start; i < end; i += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[i] ?? 0);
        max = Math.max(max, sample / channels.length);
      }
      return Number(max.toFixed(4));
    });
    return { duration: buffer.duration, peaks };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function Wave({ peaks, color, gain }: { peaks: number[]; color: string; gain: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.floor(42 * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = "42px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, 42);
      ctx.fillStyle = color;
      const width = Math.max(1, Math.floor(rect.width));
      const step = peaks.length / width;
      const scale = Math.pow(10, gain / 20);
      for (let x = 0; x < width; x += 1) {
        const peak = Math.min(1, (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * scale);
        const height = Math.max(2, peak * 40);
        ctx.fillRect(x, 21 - height / 2, 1, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [peaks, color, gain]);

  return <canvas ref={ref} className="mt-1 block w-full bg-black/20" />;
}

export default function ElectricStudioDawEditor() {
  const [tracks, setTracks] = useState<Track[]>([makeTrack("audio", 0, true), makeTrack("master", 1)]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("slip");
  const [zoom, setZoom] = useState(160);
  const [playhead, setPlayhead] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks.find((track) => track.kind === "audio") ?? tracks[0] ?? null;
  const selectedClipRef = useMemo(() => {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  }, [tracks, selectedClipId]);
  const selectedClip = selectedClipRef?.clip ?? null;
  const sessionEnd = Math.max(12, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + visibleDuration(clip))));
  const timelineWidth = Math.max(1400, sessionEnd * zoom + 360);
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, index) => index), [sessionEnd]);

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track));
    setStatus("Track updated");
  }

  function updateClip(id: string, patch: Partial<Clip>) {
    setTracks((current) => current.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === id ? { ...clip, ...patch } : clip) })));
    setStatus("Clip updated");
  }

  function armTrack(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.kind === "audio" && track.id === id })));
    setSelectedTrackId(id);
    setStatus("Record target armed");
  }

  function createTrack(kind: TrackKind) {
    if (kind === "master" && tracks.some((track) => track.kind === "master")) {
      setStatus("Master track already exists");
      return;
    }
    const next = makeTrack(kind, tracks.length, kind === "audio" && !tracks.some((track) => track.armed));
    setTracks((current) => [...current, next]);
    setSelectedTrackId(next.id);
    setStatus(`Created ${kind} track`);
  }

  function deleteTrack(id: string) {
    setTracks((current) => current.filter((track) => track.id !== id));
    if (selectedTrackId === id) setSelectedTrackId(null);
    setStatus("Track deleted");
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) {
      setStatus("Choose a real audio file");
      return;
    }

    for (const file of audioFiles) {
      const decoded = await decodeFile(file);
      const targetTrack = selectedTrack?.kind === "audio" ? selectedTrack : null;
      const color = targetTrack?.color ?? colors[tracks.length % colors.length];
      const clip: Clip = {
        id: uid("clip"),
        name: file.name.replace(/\.[a-z0-9]+$/i, ""),
        url: URL.createObjectURL(file),
        type: file.type || "audio/*",
        duration: decoded.duration,
        start: targetTrack ? playhead : 0,
        trimStart: 0,
        trimEnd: 0,
        fadeIn: 0,
        fadeOut: 0,
        gain: 0,
        muted: false,
        locked: false,
        color,
        peaks: decoded.peaks,
        groupId: null,
      };
      if (targetTrack) {
        setTracks((current) => current.map((track) => track.id === targetTrack.id ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
        setSelectedTrackId(targetTrack.id);
      } else {
        const track = makeTrack("audio", tracks.length + 1, tracks.every((item) => !item.armed));
        track.name = clip.name || track.name;
        track.color = color;
        track.clips = [clip];
        setTracks((current) => [...current, track]);
        setSelectedTrackId(track.id);
      }
      setSelectedClipId(clip.id);
    }
    setStatus("Imported audio");
  }

  function reflowShuffle(track: Track) {
    let cursor = 0;
    return {
      ...track,
      clips: [...track.clips]
        .sort((a, b) => a.start - b.start)
        .map((clip) => {
          const next = { ...clip, start: cursor };
          cursor += visibleDuration(next);
          return next;
        }),
    };
  }

  function findClip(id: string) {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === id);
      if (clip) return { track, clip };
    }
    return null;
  }

  function startClipGesture(event: React.PointerEvent, trackId: string, clip: Clip, mode: DragMode) {
    event.preventDefault();
    event.stopPropagation();
    if (clip.locked) {
      setStatus("Clip is locked");
      return;
    }
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setSelectedTrackId(trackId);
    setSelectedClipId(clip.id);
    setDraggingClipId(clip.id);
    const originalGroupStarts: Record<string, number> = {};
    if (clip.groupId && mode === "move") {
      for (const track of tracks) {
        for (const item of track.clips) if (item.groupId === clip.groupId) originalGroupStarts[item.id] = item.start;
      }
    }
    setDrag({
      clipId: clip.id,
      trackId,
      mode,
      startX: event.clientX,
      originalStart: clip.start,
      originalTrimStart: clip.trimStart,
      originalTrimEnd: clip.trimEnd,
      originalFadeIn: clip.fadeIn,
      originalFadeOut: clip.fadeOut,
      originalGroupStarts,
    });
    setStatus(`${mode === "move" ? "Moving" : mode === "trimStart" || mode === "trimEnd" ? "Trimming" : "Adjusting fade"} ${clip.name}`);
  }

  function moveDrag(event: React.PointerEvent) {
    if (!drag) return;
    const secondsDelta = (event.clientX - drag.startX) / zoom;
    const target = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLElement && element.dataset.trackId) as HTMLElement | undefined;
    setDropTargetTrackId(target?.dataset.trackId ?? null);

    setTracks((current) => current.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (drag.mode === "move" && drag.originalGroupStarts[clip.id] !== undefined) {
          return { ...clip, start: snapTime(drag.originalGroupStarts[clip.id] + secondsDelta, editMode) };
        }
        if (clip.id !== drag.clipId) return clip;
        if (drag.mode === "move") return { ...clip, start: snapTime(drag.originalStart + secondsDelta, editMode) };
        if (drag.mode === "trimStart") {
          const trim = Math.max(0, Math.min(clip.duration - 0.05, drag.originalTrimStart + secondsDelta));
          const snappedStart = snapTime(drag.originalStart + (trim - drag.originalTrimStart), editMode);
          return { ...clip, trimStart: trim, start: snappedStart };
        }
        if (drag.mode === "trimEnd") return { ...clip, trimEnd: Math.max(0, Math.min(clip.duration - 0.05, drag.originalTrimEnd - secondsDelta)) };
        if (drag.mode === "fadeIn") return { ...clip, fadeIn: Math.max(0, Math.min(visibleDuration(clip) - 0.02, drag.originalFadeIn + secondsDelta)) };
        return { ...clip, fadeOut: Math.max(0, Math.min(visibleDuration(clip) - 0.02, drag.originalFadeOut - secondsDelta)) };
      }),
    })));
  }

  function endDrag(event: React.PointerEvent) {
    if (!drag) return;
    const target = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLElement && element.dataset.trackId) as HTMLElement | undefined;
    const targetTrackId = target?.dataset.trackId;

    setTracks((current) => {
      let nextTracks = current;
      if (drag.mode === "move" && targetTrackId && targetTrackId !== drag.trackId) {
        const movingRef = current.flatMap((track) => track.clips).find((clip) => clip.id === drag.clipId);
        if (movingRef) {
          const groupIds = movingRef.groupId ? new Set(current.flatMap((track) => track.clips.filter((clip) => clip.groupId === movingRef.groupId).map((clip) => clip.id))) : new Set([drag.clipId]);
          const movingClips = current.flatMap((track) => track.clips.filter((clip) => groupIds.has(clip.id)));
          nextTracks = current.map((track) => {
            if (track.id === drag.trackId) return { ...track, clips: track.clips.filter((clip) => !groupIds.has(clip.id)) };
            if (track.id === targetTrackId && track.kind === "audio") return { ...track, clips: [...track.clips, ...movingClips].sort((a, b) => a.start - b.start) };
            return track;
          });
          setSelectedTrackId(targetTrackId);
        }
      }
      if (editMode === "shuffle") nextTracks = nextTracks.map((track) => track.id === (targetTrackId ?? drag.trackId) ? reflowShuffle(track) : track);
      return nextTracks;
    });

    if (editMode === "spot" && drag.mode === "move") {
      const next = window.prompt("Spot clip start time in seconds", "0");
      const parsed = Number(next);
      if (Number.isFinite(parsed)) {
        setTracks((current) => current.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === drag.clipId ? { ...clip, start: Math.max(0, parsed) } : clip) })));
      }
    }

    setDrag(null);
    setDraggingClipId(null);
    setDropTargetTrackId(null);
    setStatus(`${editMode.toUpperCase()} edit complete`);
  }

  function duplicateClip() {
    if (!selectedClipRef) return;
    const copy: Clip = { ...selectedClipRef.clip, id: uid("clip"), name: `${selectedClipRef.clip.name} copy`, start: selectedClipRef.clip.start + visibleDuration(selectedClipRef.clip), groupId: selectedClipRef.clip.groupId ?? null };
    setTracks((current) => current.map((track) => track.id === selectedClipRef.track.id ? { ...track, clips: [...track.clips, copy].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(copy.id);
    setStatus("Duplicated clip on track");
  }

  function groupClipsOnTrack() {
    if (!selectedClipRef) return;
    const groupId = selectedClipRef.clip.groupId ?? uid("group");
    setTracks((current) => current.map((track) => track.id === selectedClipRef.track.id ? { ...track, clips: track.clips.map((clip) => ({ ...clip, groupId })) } : track));
    setStatus("Grouped clips on selected track");
  }

  function ungroupSelected() {
    if (!selectedClip?.groupId) return;
    const groupId = selectedClip.groupId;
    setTracks((current) => current.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.groupId === groupId ? { ...clip, groupId: null } : clip) })));
    setStatus("Ungrouped clips");
  }

  function applyCrossfade() {
    if (!selectedClipRef) return;
    const track = selectedClipRef.track;
    const clip = selectedClipRef.clip;
    const nextClip = track.clips.filter((item) => item.id !== clip.id && item.start >= clip.start).sort((a, b) => a.start - b.start)[0];
    if (!nextClip) {
      setStatus("No following clip to crossfade");
      return;
    }
    const overlap = Math.max(0.08, Math.min(1.5, visibleDuration(clip) * 0.2, visibleDuration(nextClip) * 0.2));
    setTracks((current) => current.map((item) => item.id === track.id ? {
      ...item,
      clips: item.clips.map((candidate) => {
        if (candidate.id === clip.id) return { ...candidate, fadeOut: overlap };
        if (candidate.id === nextClip.id) return { ...candidate, start: Math.max(0, clip.start + visibleDuration(clip) - overlap), fadeIn: overlap };
        return candidate;
      }).sort((a, b) => a.start - b.start),
    } : item));
    setStatus("Crossfade applied between clips");
  }

  const activeDragLabel = drag ? drag.mode === "move" ? "Move" : drag.mode === "trimStart" ? "Trim start" : drag.mode === "trimEnd" ? "Trim end" : drag.mode === "fadeIn" ? "Fade in" : "Fade out" : null;

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden bg-[#101319] text-white">
      <header className="border-b border-black bg-[linear-gradient(180deg,#2b3038,#171b21)] px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/65">
          <span className="mr-auto text-cyan-200">Main DAW</span>
          <button onClick={() => createTrack("audio")} className="rounded-lg bg-cyan-300 px-3 py-2 text-black">Add Audio</button>
          <button onClick={() => createTrack("aux")} className="rounded-lg bg-[#343a44] px-3 py-2 text-white/80">Add Aux</button>
          <button onClick={() => createTrack("master")} className="rounded-lg bg-[#d8d2bd] px-3 py-2 text-black">Add Master</button>
          <label className="cursor-pointer rounded-lg bg-[#303743] px-3 py-2 text-cyan-100">Import<input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac,.aif,.aiff,.mp4" className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label>
          <button onClick={() => setPlayhead(0)} className="rounded-lg bg-black/55 px-3 py-2">Return</button>
          <button onClick={duplicateClip} disabled={!selectedClip} className="rounded-lg bg-black/55 px-3 py-2 text-white/65 disabled:opacity-35">Duplicate</button>
          <button onClick={applyCrossfade} disabled={!selectedClip} className="rounded-lg bg-pink-300 px-3 py-2 text-black disabled:opacity-35">Crossfade</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="text-white/40">Edit Mode</span>
          {(["slip", "grid", "shuffle", "spot"] as EditMode[]).map((mode) => (
            <button key={mode} onClick={() => { setEditMode(mode); setStatus(`${mode.toUpperCase()} mode`); }} className={cn("rounded-full px-3 py-2", editMode === mode ? "bg-yellow-300 text-black" : "bg-black/55 text-white/55 hover:text-white")}>{mode}</button>
          ))}
          <button onClick={groupClipsOnTrack} disabled={!selectedClip} className="rounded-full bg-violet-300 px-3 py-2 text-black disabled:opacity-35">Group Track Clips</button>
          <button onClick={ungroupSelected} disabled={!selectedClip?.groupId} className="rounded-full bg-black/55 px-3 py-2 text-white/65 disabled:opacity-35">Ungroup</button>
          <span className="ml-auto text-white/40">Zoom {zoom}px/sec</span>
          <button onClick={() => setZoom((value) => Math.max(20, value / 2))} className="rounded-lg bg-black/55 px-3 py-2 text-white/65">Zoom Out</button>
          <button onClick={() => setZoom((value) => Math.min(2400, value * 2))} className="rounded-lg bg-black/55 px-3 py-2 text-white/65">Zoom In</button>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[270px_1fr_250px] overflow-hidden max-lg:grid-cols-[220px_1fr] max-md:grid-cols-1" ref={containerRef}>
        <aside className="min-h-0 overflow-auto border-r border-black bg-[#1b2028] max-md:max-h-[34svh] max-md:border-b max-md:border-r-0">
          <div className="sticky top-0 z-10 border-b border-black bg-[#252b34] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45">Tracks</div>
          {tracks.length === 0 && <p className="p-4 text-sm text-white/45">Add or import an audio track.</p>}
          {tracks.map((track) => (
            <article key={track.id} onClick={() => setSelectedTrackId(track.id)} className={cn("border-b border-black bg-[linear-gradient(180deg,#252a33,#1a1f27)] p-3", selectedTrack?.id === track.id && "ring-1 ring-cyan-300/70")}>
              <div className="flex items-center gap-3">
                <span className="h-12 w-2 rounded-full" style={{ backgroundColor: track.color }} />
                <div className="min-w-0 flex-1">
                  <input value={track.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="w-full rounded-lg border border-white/10 bg-black/55 px-2 py-2 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-cyan-300" />
                  <p className="mt-1 text-[9px] uppercase tracking-widest text-white/35">{track.kind} · {track.clips.length} clips</p>
                </div>
                <button onClick={(event) => { event.stopPropagation(); deleteTrack(track.id); }} className="rounded-lg bg-red-500 px-3 py-2 text-[9px] font-black uppercase text-black">Del</button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest">
                <button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={cn("min-h-9 rounded-lg border", track.muted ? "border-yellow-200 bg-yellow-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Mute</button>
                <button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={cn("min-h-9 rounded-lg border", track.solo ? "border-cyan-200 bg-cyan-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Solo</button>
                <button disabled={track.kind !== "audio"} onClick={(event) => { event.stopPropagation(); armTrack(track.id); }} className={cn("min-h-9 rounded-lg border disabled:opacity-35", track.armed ? "border-red-200 bg-red-500 text-black" : "border-white/10 bg-black/55 text-white/55")}>Rec</button>
              </div>
            </article>
          ))}
        </aside>

        <section className="grid min-h-0 grid-rows-[38px_1fr_36px] overflow-hidden bg-[#10141a]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
          <div className="relative border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}>
            {seconds.map((second) => <button key={second} onClick={() => setPlayhead(second)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: second * zoom, width: zoom }}>{second % 2 ? second : formatTime(second)}</button>)}
            <div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} />
          </div>

          {tracks.length === 0 ? (
            <div className="grid place-items-center text-center">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2>
                <p className="mt-3 text-sm text-white/50">Add a track, import audio, then edit clips in Slip, Grid, Shuffle, or Spot mode.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-auto">
              <div className="relative" style={{ width: timelineWidth }}>
                {tracks.map((track) => (
                  <div key={track.id} data-track-id={track.id} className={cn("relative h-[96px] border-b border-black bg-[#151a22] transition-colors", dropTargetTrackId === track.id && "bg-cyan-300/[0.08] ring-1 ring-inset ring-cyan-300/50")}>
                    <div className="absolute inset-0">{seconds.map((second) => <span key={second} className={cn("absolute bottom-0 top-0 border-r", editMode === "grid" ? "border-cyan-300/25" : "border-black/70")} style={{ left: second * zoom, width: zoom }} />)}</div>
                    {track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}
                    {track.muted && <div className="absolute inset-0 z-10 pointer-events-none bg-black/35" />}
                    {track.clips.map((clip) => {
                      const selected = selectedClipId === clip.id;
                      const isGrouped = Boolean(clip.groupId);
                      const dragActive = draggingClipId === clip.id || Boolean(clip.groupId && findClip(draggingClipId ?? "")?.clip.groupId === clip.groupId);
                      const width = Math.max(92, visibleDuration(clip) * zoom);
                      const fadeInWidth = Math.min(width / 2, clip.fadeIn * zoom);
                      const fadeOutWidth = Math.min(width / 2, clip.fadeOut * zoom);
                      return (
                        <div key={clip.id} role="button" tabIndex={0} onPointerDown={(event) => startClipGesture(event, track.id, clip, "move")} onPointerMove={moveDrag} onPointerUp={endDrag} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("absolute top-[10px] h-[76px] touch-none rounded-xl border px-4 text-left shadow-inner transition-[box-shadow,transform,opacity]", selected ? "z-30 ring-2 ring-cyan-100 shadow-[0_0_26px_rgba(103,232,249,.5)]" : "z-10 opacity-86 hover:opacity-100", dragActive && "scale-[1.012] cursor-grabbing shadow-[0_0_28px_rgba(255,255,255,.2)]", clip.locked && "opacity-60", isGrouped && "outline outline-1 outline-violet-300/60")} style={{ left: clip.start * zoom, width, borderColor: selected ? "#ffffff" : clip.color, backgroundColor: `${clip.color}${selected ? "38" : "24"}`, cursor: "grab" }}>
                          {selected && activeDragLabel && draggingClipId === clip.id && <span className="absolute -top-6 left-2 rounded-full bg-cyan-200 px-2 py-1 text-[9px] font-black uppercase text-black">{activeDragLabel}</span>}
                          <div className="pointer-events-none absolute bottom-0 left-0 top-0 rounded-l-xl bg-cyan-100/10" style={{ width: fadeInWidth, clipPath: "polygon(0 100%, 100% 0, 100% 100%)" }} />
                          <div className="pointer-events-none absolute bottom-0 right-0 top-0 rounded-r-xl bg-pink-100/10" style={{ width: fadeOutWidth, clipPath: "polygon(0 0, 100% 100%, 0 100%)" }} />
                          <div className="pointer-events-none absolute left-8 right-8 border-t border-yellow-200/80" style={{ top: `${gainPercent(clip.gain)}%` }} />
                          <span className="pointer-events-none absolute right-8 rounded-full bg-yellow-200 px-1.5 py-0.5 text-[8px] font-black text-black" style={{ top: `calc(${gainPercent(clip.gain)}% - 9px)` }}>{clip.gain}dB</span>
                          <button aria-label="Trim clip start" onPointerDown={(event) => startClipGesture(event, track.id, clip, "trimStart")} className="absolute bottom-1 left-1 top-1 min-w-9 cursor-ew-resize touch-none rounded-lg border border-white/30 bg-black/82 text-[10px] font-black text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.25)] hover:bg-cyan-200 hover:text-black">TR</button>
                          <button aria-label="Trim clip end" onPointerDown={(event) => startClipGesture(event, track.id, clip, "trimEnd")} className="absolute bottom-1 right-1 top-1 min-w-9 cursor-ew-resize touch-none rounded-lg border border-white/30 bg-black/82 text-[10px] font-black text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,.25)] hover:bg-cyan-200 hover:text-black">TR</button>
                          <button aria-label="Fade in" onPointerDown={(event) => startClipGesture(event, track.id, clip, "fadeIn")} className="absolute left-10 top-1 h-6 min-w-8 cursor-ew-resize touch-none rounded-md border border-cyan-200/40 bg-cyan-300/25 text-[8px] font-black text-cyan-50">FI</button>
                          <button aria-label="Fade out" onPointerDown={(event) => startClipGesture(event, track.id, clip, "fadeOut")} className="absolute right-10 top-1 h-6 min-w-8 cursor-ew-resize touch-none rounded-md border border-pink-200/40 bg-pink-300/25 text-[8px] font-black text-pink-50">FO</button>
                          <b className="ml-9 mr-9 block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color }}>{clip.muted ? "MUTED · " : ""}{isGrouped ? "GROUP · " : ""}{clip.name}</b>
                          <div className="ml-9 mr-9"><Wave peaks={clip.peaks} color={clip.color} gain={clip.gain} /></div>
                          <span className="absolute bottom-1 left-12 text-[9px] uppercase text-white/45">{editMode.toUpperCase()} · {formatTime(clip.start)} · {formatTime(visibleDuration(clip))}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} />
              </div>
            </div>
          )}
          <input type="range" min={0} max={sessionEnd} step={0.01} value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-full accent-cyan-300" />
        </section>

        <aside className="min-h-0 overflow-auto border-l border-black bg-[#20242b] p-3 text-xs text-white/60 max-lg:hidden">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Inspector</h2>
          {selectedTrack ? <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3"><b className="block truncate uppercase" style={{ color: selectedTrack.color }}>{selectedTrack.name}</b><label className="mt-3 block uppercase text-white/40">Volume {selectedTrack.volume}<input type="range" min="0" max="100" value={selectedTrack.volume} onChange={(event) => updateTrack(selectedTrack.id, { volume: Number(event.target.value) })} className="w-full accent-cyan-300" /></label><label className="mt-3 block uppercase text-white/40">Pan {selectedTrack.pan}<input type="range" min="-50" max="50" value={selectedTrack.pan} onChange={(event) => updateTrack(selectedTrack.id, { pan: Number(event.target.value) })} className="w-full accent-cyan-300" /></label></div> : <p className="mt-3 text-white/40">No track selected.</p>}
          {selectedClip && <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3"><b className="block truncate uppercase text-white/70">{selectedClip.name}</b><label className="mt-3 block uppercase text-white/40">Clip Gain {selectedClip.gain} dB<input type="range" min="-24" max="24" value={selectedClip.gain} onChange={(event) => updateClip(selectedClip.id, { gain: Number(event.target.value) })} className="w-full accent-yellow-300" /></label><label className="mt-3 block uppercase text-white/40">Fade In {selectedClip.fadeIn.toFixed(2)}s<input type="range" min="0" max={visibleDuration(selectedClip)} step="0.01" value={selectedClip.fadeIn} onChange={(event) => updateClip(selectedClip.id, { fadeIn: Number(event.target.value) })} className="w-full accent-cyan-300" /></label><label className="mt-3 block uppercase text-white/40">Fade Out {selectedClip.fadeOut.toFixed(2)}s<input type="range" min="0" max={visibleDuration(selectedClip)} step="0.01" value={selectedClip.fadeOut} onChange={(event) => updateClip(selectedClip.id, { fadeOut: Number(event.target.value) })} className="w-full accent-pink-300" /></label><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={duplicateClip} className="rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-black uppercase text-black">Duplicate</button><button onClick={applyCrossfade} className="rounded-lg bg-pink-300 px-3 py-2 text-[10px] font-black uppercase text-black">Crossfade</button><button onClick={groupClipsOnTrack} className="rounded-lg bg-violet-300 px-3 py-2 text-[10px] font-black uppercase text-black">Group</button><button onClick={ungroupSelected} disabled={!selectedClip.groupId} className="rounded-lg bg-black/55 px-3 py-2 text-[10px] font-black uppercase text-white/65 disabled:opacity-35">Ungroup</button></div><button onClick={() => setTracks((current) => current.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selectedClip.id) })))} className="mt-3 w-full rounded-lg bg-red-500 px-3 py-2 text-[10px] font-black uppercase text-black">Delete Clip</button></div>}
        </aside>
      </section>

      <footer className="flex items-center gap-3 border-t border-black bg-[#15171b] px-3 py-1 text-[10px] uppercase tracking-widest text-white/45">
        <span>{status}</span>
        <span className="ml-auto">{tracks.length} tracks · {tracks.flatMap((track) => track.clips).length} clips · mode {editMode}</span>
      </footer>
    </main>
  );
}
