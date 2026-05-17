"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type Mode = "edit" | "mix" | "beat" | "export";
type EditTool = "smart" | "selector" | "grabber" | "trim" | "pencil" | "scrubber" | "zoomer";
type EditMode = "slip" | "grid" | "spot" | "shuffle";
type Clip = { id: string; name: string; url: string; type: string; size: number; duration: number; peaks: number[]; start: number; trimStart: number; trimEnd: number; fadeIn: number; fadeOut: number; gain: number; muted: boolean; locked: boolean; groupId?: string; color?: string };
type Track = { id: string; name: string; color: string; armed: boolean; muted: boolean; solo: boolean; volume: number; pan: number; inputGain: number; clips: Clip[] };
type EditHistoryItem = { label: string; tracks: Track[] };
type ClipboardClip = { trackId: string; clip: Clip } | null;

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e", "#8ee3f5"];
const audioNamePattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const toolLabels: EditTool[] = ["smart", "selector", "grabber", "trim", "pencil", "scrubber", "zoomer"];
const editModes: EditMode[] = ["slip", "grid", "spot", "shuffle"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cloneTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) }));
}

function cleanName(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ").trim() || "Audio Track";
}

function fileSlug(value: string) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audio";
}

function clipExt(clip: Clip) {
  const ext = clip.name.split(".").pop();
  if (ext && ext.length <= 5) return ext.toLowerCase();
  if (clip.type.includes("wav")) return "wav";
  if (clip.type.includes("mpeg")) return "mp3";
  if (clip.type.includes("webm")) return "webm";
  return "audio";
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const frames = Math.floor((safe % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${frames.toString().padStart(2, "0")}`;
}

function visibleDuration(clip: Clip) {
  return Math.max(0.05, clip.duration - clip.trimStart - clip.trimEnd);
}

function snapTime(value: number, editMode: EditMode, gridSize: number) {
  if (editMode !== "grid") return Math.max(0, value);
  return Math.max(0, Math.round(value / gridSize) * gridSize);
}

function clipAt(tracks: Track[], clipId: string | null) {
  for (const track of tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

async function decodeAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const count = 1200;
    const block = Math.max(1, Math.floor(buffer.length / count));
    const peaks = Array.from({ length: count }, (_, i) => {
      let max = 0;
      const start = i * block;
      const end = Math.min(buffer.length, start + block);
      for (let s = start; s < end; s += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[s] ?? 0);
        max = Math.max(max, sample / channels.length);
      }
      return Number(max.toFixed(4));
    });
    return { duration: buffer.duration, peaks };
  } finally {
    await ctx.close();
  }
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<EditTool>("smart");
  const [editMode, setEditMode] = useState<EditMode>("grid");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [zoom, setZoom] = useState(110);
  const [playhead, setPlayhead] = useState(0);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(4);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [nudge, setNudge] = useState(0.1);
  const [gridSize, setGridSize] = useState(0.25);
  const [clipboard, setClipboard] = useState<ClipboardClip>(null);
  const [undoStack, setUndoStack] = useState<EditHistoryItem[]>([]);
  const [redoStack, setRedoStack] = useState<EditHistoryItem[]>([]);
  const [editLog, setEditLog] = useState<string[]>([]);
  const [regionPanelOpen, setRegionPanelOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<HTMLAudioElement[]>([]);
  const playStart = useRef(0);
  const timer = useRef<number | null>(null);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? null;
  const selectedClipRef = clipAt(tracks, selectedClipId);
  const selectedClip = selectedClipRef?.clip ?? selectedTrack?.clips[0] ?? null;
  const armed = tracks.find((track) => track.armed) ?? selectedTrack;
  const sessionEnd = Math.max(10, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + visibleDuration(clip))));

  useEffect(() => () => {
    tracks.flatMap((track) => track.clips).forEach((clip) => URL.revokeObjectURL(clip.url));
    stopTransport();
  }, []);

  function logEdit(label: string) {
    setEditLog((current) => [`${new Date().toLocaleTimeString()}  ${label}`, ...current].slice(0, 30));
  }

  function commit(label: string, recipe: (draft: Track[]) => Track[]) {
    setTracks((current) => {
      setUndoStack((history) => [{ label, tracks: cloneTracks(current) }, ...history].slice(0, 50));
      setRedoStack([]);
      const next = recipe(cloneTracks(current));
      return next;
    });
    logEdit(label);
  }

  function clearTimer() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioNamePattern.test(file.name));
    if (!audioFiles.length) {
      setError("That file type was not accepted. Use WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const newTracks: Track[] = [];
      for (const file of audioFiles) {
        const decoded = await decodeAudio(file);
        const id = `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const clipId = `clip-${id}`;
        const index = tracks.length + newTracks.length;
        newTracks.push({
          id,
          name: cleanName(file.name),
          color: colors[index % colors.length],
          armed: tracks.length === 0 && newTracks.length === 0,
          muted: false,
          solo: false,
          volume: 78,
          pan: 0,
          inputGain: 60,
          clips: [{ id: clipId, name: file.name, url: URL.createObjectURL(file), type: file.type || "audio", size: file.size, duration: decoded.duration, peaks: decoded.peaks, start: 0, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false, color: colors[index % colors.length] }],
        });
        setSelectedTrackId(id);
        setSelectedClipId(clipId);
      }
      commit(`Import ${newTracks.length} audio file${newTracks.length === 1 ? "" : "s"}`, (draft) => [...draft, ...newTracks]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio could not be decoded. Try converting it to WAV or MP3 and import again.");
    } finally {
      setBusy(false);
    }
  }

  function stopTransport(reset = false) {
    players.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    players.current = [];
    clearTimer();
    setPlaying(false);
    if (reset) setPlayhead(0);
  }

  function playTransport() {
    if (playing) return;
    if (!tracks.length) return;
    const soloed = tracks.filter((track) => track.solo);
    const sourceTracks = soloed.length ? soloed : tracks;
    const clips = sourceTracks.flatMap((track) => track.muted ? [] : track.clips.filter((clip) => !clip.muted && playhead < clip.start + visibleDuration(clip)).map((clip) => ({ track, clip })));
    if (!clips.length) return;
    const nowStart = performance.now() / 1000 - playhead;
    playStart.current = nowStart;
    players.current = clips.map(({ track, clip }) => {
      const audio = new Audio(clip.url);
      audio.volume = Math.min(1, Math.max(0, (track.volume / 100) * Math.pow(10, clip.gain / 20)));
      audio.currentTime = Math.max(0, clip.trimStart + playhead - clip.start);
      const wait = Math.max(0, clip.start - playhead) * 1000;
      window.setTimeout(() => { void audio.play().catch((err) => setError(err instanceof Error ? err.message : "Playback failed.")); }, wait);
      return audio;
    });
    setPlaying(true);
    timer.current = window.setInterval(() => {
      const next = performance.now() / 1000 - playStart.current;
      if (loopEnabled && next >= selectionEnd) {
        setPlayhead(selectionStart);
        stopTransport();
        window.setTimeout(playTransport, 0);
        return;
      }
      setPlayhead(next);
      if (next >= sessionEnd) stopTransport();
    }, 40);
  }

  function arm(id: string) {
    commit("Arm record track", (draft) => draft.map((track) => ({ ...track, armed: track.id === id })));
    setSelectedTrackId(id);
  }

  function updateTrack(id: string, patch: Partial<Track>, label = "Update track") {
    commit(label, (draft) => draft.map((track) => track.id === id ? { ...track, ...patch, clips: patch.clips ?? track.clips } : track));
  }

  function updateClip(clipId: string, patch: Partial<Clip>, label = "Update clip") {
    commit(label, (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === clipId && !clip.locked ? { ...clip, ...patch } : clip) })));
  }

  function undo() {
    const item = undoStack[0];
    if (!item) return;
    setRedoStack((history) => [{ label: "Redo", tracks: cloneTracks(tracks) }, ...history].slice(0, 50));
    setTracks(cloneTracks(item.tracks));
    setUndoStack((history) => history.slice(1));
    logEdit(`Undo: ${item.label}`);
  }

  function redo() {
    const item = redoStack[0];
    if (!item) return;
    setUndoStack((history) => [{ label: "Undo", tracks: cloneTracks(tracks) }, ...history].slice(0, 50));
    setTracks(cloneTracks(item.tracks));
    setRedoStack((history) => history.slice(1));
    logEdit("Redo edit");
  }

  function selectedIds() {
    return { trackId: selectedClipRef?.track.id ?? selectedTrack?.id ?? null, clipId: selectedClip?.id ?? null };
  }

  function splitAtPlayhead() {
    const ref = selectedClipRef;
    if (!ref || ref.clip.locked) return;
    const { track, clip } = ref;
    const local = playhead - clip.start;
    if (local <= 0.02 || local >= visibleDuration(clip) - 0.02) return;
    const left: Clip = { ...clip, id: `${clip.id}-a-${Date.now().toString(36)}`, trimEnd: clip.trimEnd + visibleDuration(clip) - local, name: `${clip.name} A` };
    const right: Clip = { ...clip, id: `${clip.id}-b-${Date.now().toString(36)}`, start: clip.start + local, trimStart: clip.trimStart + local, name: `${clip.name} B` };
    commit("Separate clip at playhead", (draft) => draft.map((item) => item.id === track.id ? { ...item, clips: item.clips.flatMap((candidate) => candidate.id === clip.id ? [left, right] : [candidate]) } : item));
    setSelectedClipId(right.id);
  }

  function healSelectedClip() {
    const ref = selectedClipRef;
    if (!ref) return;
    commit("Heal clip edges", (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === ref.clip.id ? { ...clip, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0 } : clip) })));
  }

  function duplicateSelectedClip() {
    const ref = selectedClipRef;
    if (!ref) return;
    const copy: Clip = { ...ref.clip, id: `clip-${Date.now().toString(36)}`, start: snapTime(ref.clip.start + visibleDuration(ref.clip) + gridSize, editMode, gridSize), name: `${ref.clip.name} copy`, locked: false };
    commit("Duplicate clip", (draft) => draft.map((track) => track.id === ref.track.id ? { ...track, clips: [...track.clips, copy].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(copy.id);
  }

  function consolidateSelectedClip() {
    const ref = selectedClipRef;
    if (!ref) return;
    updateClip(ref.clip.id, { trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, name: `${ref.clip.name} consolidated` }, "Consolidate clip metadata");
  }

  function renameSelectedClip() {
    const ref = selectedClipRef;
    if (!ref) return;
    const name = window.prompt("Rename clip", ref.clip.name);
    if (!name) return;
    updateClip(ref.clip.id, { name }, "Rename clip");
  }

  function deleteSelectedClip() {
    const id = selectedClip?.id;
    if (!id) return;
    commit("Delete clip", (draft) => draft.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== id) })).filter((track) => track.clips.length > 0));
    setSelectedClipId(null);
  }

  function nudgeSelected(direction: -1 | 1) {
    const ref = selectedClipRef;
    if (!ref || ref.clip.locked) return;
    const next = snapTime(ref.clip.start + direction * nudge, editMode, gridSize);
    updateClip(ref.clip.id, { start: next }, direction < 0 ? "Nudge clip left" : "Nudge clip right");
  }

  function moveClipToTrack(targetTrackId: string) {
    const ref = selectedClipRef;
    if (!ref || ref.track.id === targetTrackId) return;
    commit("Move clip between tracks", (draft) => {
      const moving = ref.clip;
      return draft.map((track) => {
        if (track.id === ref.track.id) return { ...track, clips: track.clips.filter((clip) => clip.id !== moving.id) };
        if (track.id === targetTrackId) return { ...track, clips: [...track.clips, moving].sort((a, b) => a.start - b.start) };
        return track;
      }).filter((track) => track.clips.length > 0);
    });
  }

  function trimClipEdge(edge: "left" | "right", amount: number) {
    const ref = selectedClipRef;
    if (!ref || ref.clip.locked) return;
    if (edge === "left") updateClip(ref.clip.id, { trimStart: Math.max(0, Math.min(ref.clip.duration - 0.05, ref.clip.trimStart + amount)), start: Math.max(0, ref.clip.start + amount) }, "Trim clip left edge");
    else updateClip(ref.clip.id, { trimEnd: Math.max(0, Math.min(ref.clip.duration - 0.05, ref.clip.trimEnd + amount)) }, "Trim clip right edge");
  }

  function copyClip(cut = false) {
    const ref = selectedClipRef;
    if (!ref) return;
    setClipboard({ trackId: ref.track.id, clip: { ...ref.clip } });
    logEdit(cut ? "Cut clip" : "Copy clip");
    if (cut) deleteSelectedClip();
  }

  function pasteClip() {
    if (!clipboard) return;
    const targetTrackId = selectedTrack?.id ?? clipboard.trackId;
    const pasted: Clip = { ...clipboard.clip, id: `clip-${Date.now().toString(36)}`, start: snapTime(playhead, editMode, gridSize), name: `${clipboard.clip.name} paste`, locked: false };
    commit("Paste clip", (draft) => draft.map((track) => track.id === targetTrackId ? { ...track, clips: [...track.clips, pasted].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(pasted.id);
  }

  function clearSelection() {
    if (!selectedClipId) return;
    deleteSelectedClip();
  }

  function trimToSelection() {
    const ref = selectedClipRef;
    if (!ref) return;
    const clipEnd = ref.clip.start + visibleDuration(ref.clip);
    const start = Math.max(ref.clip.start, selectionStart);
    const end = Math.min(clipEnd, selectionEnd);
    if (end <= start) return;
    updateClip(ref.clip.id, { start, trimStart: ref.clip.trimStart + start - ref.clip.start, trimEnd: ref.clip.trimEnd + clipEnd - end }, "Trim clip to selection");
  }

  function detectTransients() {
    const ref = selectedClipRef;
    if (!ref) return;
    const threshold = Math.max(0.18, Math.max(...ref.clip.peaks) * 0.7);
    const first = ref.clip.peaks.findIndex((peak, index) => index > 0 && peak >= threshold && ref.clip.peaks[index - 1] < threshold);
    if (first >= 0) {
      const seconds = ref.clip.start + (first / ref.clip.peaks.length) * ref.clip.duration;
      setPlayhead(seconds);
      logEdit("Detect transient");
    }
  }

  function tabToTransient() {
    const ref = selectedClipRef;
    if (!ref) return;
    const startIndex = Math.floor(((playhead - ref.clip.start) / ref.clip.duration) * ref.clip.peaks.length);
    const threshold = Math.max(0.16, Math.max(...ref.clip.peaks) * 0.55);
    const next = ref.clip.peaks.findIndex((peak, index) => index > Math.max(0, startIndex) && peak >= threshold && (ref.clip.peaks[index - 1] ?? 0) < threshold);
    if (next >= 0) setPlayhead(ref.clip.start + (next / ref.clip.peaks.length) * ref.clip.duration);
    logEdit("Tab to transient");
  }

  function groupSelectedClip() {
    const ref = selectedClipRef;
    if (!ref) return;
    updateClip(ref.clip.id, { groupId: ref.clip.groupId ? undefined : `grp-${Date.now().toString(36)}` }, ref.clip.groupId ? "Ungroup clip" : "Group clip");
  }

  function setClipColor() {
    const ref = selectedClipRef;
    if (!ref) return;
    const next = colors[(colors.indexOf(ref.clip.color ?? ref.track.color) + 1) % colors.length];
    updateClip(ref.clip.id, { color: next }, "Change clip color");
  }

  function zoomIn() { setZoom((value) => Math.min(480, value + 30)); }
  function zoomOut() { setZoom((value) => Math.max(35, value - 30)); }
  function zoomFit() { setZoom(Math.max(45, Math.min(170, 1200 / sessionEnd))); }

  return <div className="h-dvh overflow-hidden bg-[#111316] text-[#d8d8d8]"><div className="grid h-full grid-rows-[34px_92px_1fr]">
    <div className="flex items-center border-b border-black bg-[#26282c] text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"><button onClick={() => setMode("edit")} className="h-full border-r border-black px-4 text-cyan-200">EMS Studio</button>{(["edit", "mix", "beat", "export"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("h-full border-r border-black px-5", mode === item ? "bg-[#d8d2bd] text-black" : "bg-[#303238] text-white/72 hover:bg-[#3b3e45]")}>{item}</button>)}<div className="ml-auto flex h-full items-center gap-2 px-3"><span>Counter</span><span className="min-w-[96px] bg-black px-3 py-1 font-mono text-green-300">{formatTime(playhead)}</span></div></div>
    <div className="grid grid-rows-2 border-b border-black bg-[#1d2025] text-[11px] uppercase tracking-widest text-white/70"><div className="flex items-center gap-2 px-3"><button onClick={() => { stopTransport(true); }} className="h-8 border border-black bg-[#30343b] px-3 font-black">|&lt;</button><button onClick={() => stopTransport()} className="h-8 border border-black bg-[#30343b] px-4 font-black">Stop</button><button onClick={playing ? () => stopTransport() : playTransport} disabled={!tracks.length} className={cn("h-8 min-w-16 border border-black px-4 font-black disabled:opacity-35", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Pause" : "Play"}</button><button onClick={() => armed && arm(armed.id)} className="h-8 border border-black bg-red-500/80 px-4 font-black text-black">Rec</button><label className="flex h-8 cursor-pointer items-center border border-black bg-[#353941] px-4 font-black text-cyan-100">{busy ? "Importing" : "Import Audio"}<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label><button onClick={undo} className="h-8 border border-black bg-[#30343b] px-3 font-black">Undo</button><button onClick={redo} className="h-8 border border-black bg-[#30343b] px-3 font-black">Redo</button><button onClick={zoomOut} className="h-8 border border-black bg-[#30343b] px-3 font-black">Zoom -</button><button onClick={zoomIn} className="h-8 border border-black bg-[#30343b] px-3 font-black">Zoom +</button><button onClick={zoomFit} className="h-8 border border-black bg-[#30343b] px-3 font-black">Fit</button><span className="ml-auto border border-black bg-[#121417] px-3 py-2">File: <b className="text-cyan-200">{selectedClip?.name ?? "none"}</b></span></div><div className="flex items-center gap-2 px-3"><div className="flex border border-black">{toolLabels.map((item) => <button key={item} onClick={() => setTool(item)} className={cn("px-3 py-1 font-black", tool === item ? "bg-[#d8d2bd] text-black" : "bg-[#30343b] text-white/65")}>{item}</button>)}</div><div className="flex border border-black">{editModes.map((item) => <button key={item} onClick={() => setEditMode(item)} className={cn("px-3 py-1 font-black", editMode === item ? "bg-cyan-300 text-black" : "bg-[#30343b] text-white/65")}>{item}</button>)}</div><label>Nudge <select value={nudge} onChange={(event) => setNudge(Number(event.target.value))} className="bg-black px-2 py-1 text-green-300"><option value={0.01}>10 ms</option><option value={0.05}>50 ms</option><option value={0.1}>100 ms</option><option value={0.25}>1/4s</option><option value={1}>1s</option></select></label><label>Grid <select value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} className="bg-black px-2 py-1 text-green-300"><option value={0.125}>1/32</option><option value={0.25}>1/16</option><option value={0.5}>1/8</option><option value={1}>1/4</option><option value={2}>1/2</option></select></label><button onClick={splitAtPlayhead} className="bg-[#30343b] px-3 py-1 font-black">Separate</button><button onClick={healSelectedClip} className="bg-[#30343b] px-3 py-1 font-black">Heal</button><button onClick={duplicateSelectedClip} className="bg-[#30343b] px-3 py-1 font-black">Duplicate</button><button onClick={consolidateSelectedClip} className="bg-[#30343b] px-3 py-1 font-black">Consolidate</button><button onClick={renameSelectedClip} className="bg-[#30343b] px-3 py-1 font-black">Rename</button><button onClick={deleteSelectedClip} className="bg-red-500 px-3 py-1 font-black text-black">Delete</button></div></div>
    {error && <div className="absolute left-3 right-3 top-[130px] z-40 border border-red-400/50 bg-red-950 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}
    <main className="min-h-0 overflow-hidden bg-[#171a1f]">{mode === "beat" && <BeatMachineProClient studioMode />}{mode === "edit" && <EditWorkspace tracks={tracks} selectedTrack={selectedTrack} selectedClip={selectedClip} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} importFiles={importFiles} updateTrack={updateTrack} updateClip={updateClip} arm={arm} tool={tool} editMode={editMode} zoom={zoom} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} selectionStart={selectionStart} selectionEnd={selectionEnd} setSelectionStart={setSelectionStart} setSelectionEnd={setSelectionEnd} loopEnabled={loopEnabled} setLoopEnabled={setLoopEnabled} nudgeLeft={() => nudgeSelected(-1)} nudgeRight={() => nudgeSelected(1)} trimLeft={(amount) => trimClipEdge("left", amount)} trimRight={(amount) => trimClipEdge("right", amount)} copyClip={() => copyClip(false)} cutClip={() => copyClip(true)} pasteClip={pasteClip} clearSelection={clearSelection} trimToSelection={trimToSelection} tabToTransient={tabToTransient} detectTransients={detectTransients} groupSelectedClip={groupSelectedClip} setClipColor={setClipColor} moveClipToTrack={moveClipToTrack} regionPanelOpen={regionPanelOpen} setRegionPanelOpen={setRegionPanelOpen} editLog={editLog} />}{mode === "mix" && <MixerWorkspace tracks={tracks} selected={selectedTrack} update={updateTrack} arm={arm} />}{mode === "export" && <ExportWorkspace tracks={tracks} selected={selectedTrack} />}</main>
  </div></div>;
}

function EditWorkspace({ tracks, selectedTrack, selectedClip, selectedClipId, setSelectedTrackId, setSelectedClipId, importFiles, updateTrack, updateClip, arm, tool, editMode, zoom, playhead, setPlayhead, sessionEnd, selectionStart, selectionEnd, setSelectionStart, setSelectionEnd, loopEnabled, setLoopEnabled, nudgeLeft, nudgeRight, trimLeft, trimRight, copyClip, cutClip, pasteClip, clearSelection, trimToSelection, tabToTransient, detectTransients, groupSelectedClip, setClipColor, moveClipToTrack, regionPanelOpen, setRegionPanelOpen, editLog }: { tracks: Track[]; selectedTrack: Track | null; selectedClip: Clip | null; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; updateTrack: (id: string, patch: Partial<Track>, label?: string) => void; updateClip: (id: string, patch: Partial<Clip>, label?: string) => void; arm: (id: string) => void; tool: EditTool; editMode: EditMode; zoom: number; playhead: number; setPlayhead: (seconds: number) => void; sessionEnd: number; selectionStart: number; selectionEnd: number; setSelectionStart: (seconds: number) => void; setSelectionEnd: (seconds: number) => void; loopEnabled: boolean; setLoopEnabled: (value: boolean) => void; nudgeLeft: () => void; nudgeRight: () => void; trimLeft: (amount: number) => void; trimRight: (amount: number) => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; clearSelection: () => void; trimToSelection: () => void; tabToTransient: () => void; detectTransients: () => void; groupSelectedClip: () => void; setClipColor: () => void; moveClipToTrack: (id: string) => void; regionPanelOpen: boolean; setRegionPanelOpen: (value: boolean) => void; editLog: string[] }) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 480);
  return <div className={cn("grid h-full min-h-0 bg-[#1b1f26]", regionPanelOpen ? "grid-cols-[270px_1fr_250px]" : "grid-cols-[270px_1fr]")}> <div className="grid min-h-0 grid-rows-[42px_1fr_238px] border-r border-black bg-[#252930]"><div className="flex items-center border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55">Tracks</div><div className="overflow-auto">{tracks.length === 0 && <div className="px-3 py-4 text-xs leading-5 text-white/45">No tracks loaded.</div>}{tracks.map((track) => <button key={track.id} onClick={() => setSelectedTrackId(track.id)} className={cn("grid min-h-[86px] w-full grid-cols-[8px_1fr_74px] border-b border-black text-left", selectedTrack?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]")}><span style={{ backgroundColor: track.color }} /><span className="min-w-0 px-3 py-2"><b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b><span className="mt-1 block text-[10px] uppercase tracking-wide text-white/40">{track.clips.length} clip{track.clips.length === 1 ? "" : "s"}</span><span className="mt-2 block h-2 bg-black"><span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} /></span></span><span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase"><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { muted: !track.muted }, "Toggle mute"); }} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>M</button><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }, "Toggle solo"); }} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>S</button><button onClick={(event) => { event.stopPropagation(); arm(track.id); }} className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45"}>Rec</button></span></button>)}</div><Inspector track={selectedTrack} clip={selectedClip} updateTrack={updateTrack} updateClip={updateClip} arm={arm} nudgeLeft={nudgeLeft} nudgeRight={nudgeRight} trimLeft={trimLeft} trimRight={trimRight} copyClip={copyClip} cutClip={cutClip} pasteClip={pasteClip} clearSelection={clearSelection} trimToSelection={trimToSelection} tabToTransient={tabToTransient} detectTransients={detectTransients} groupSelectedClip={groupSelectedClip} setClipColor={setClipColor} moveClipToTrack={moveClipToTrack} tracks={tracks} /></div><section className="grid min-h-0 grid-rows-[42px_1fr_58px] overflow-hidden bg-[#171a1f]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}><div className="relative overflow-hidden border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}><div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} />{seconds.map((second) => <button key={second} onClick={() => setPlayhead(second)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: second * zoom, width: zoom }}>{second % 2 === 0 ? formatTime(second) : second}</button>)}</div>{tracks.length === 0 ? <div className="grid h-full place-items-center bg-[#171a1f]"><div className="text-center"><h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2><p className="mt-3 text-sm text-white/50">Import or drop real audio. Edit tools, clips, regions, zoom, transport, and history are active.</p><label className="mt-5 inline-block cursor-pointer bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">Import Audio<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label></div></div> : <div className="overflow-auto"><div className="relative" style={{ width: timelineWidth }}>{tracks.map((track) => <div key={track.id} className="relative h-[86px] border-b border-black bg-[#1b1f26]"><div className="absolute inset-0">{seconds.map((second) => <span key={second} className="absolute bottom-0 top-0 border-r border-black/70" style={{ left: second * zoom, width: zoom }} />)}</div>{track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}<div className="absolute bottom-0 top-0 bg-cyan-300/10" style={{ left: selectionStart * zoom, width: Math.max(1, (selectionEnd - selectionStart) * zoom) }} />{track.clips.map((clip) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("absolute top-[10px] h-[66px] border px-3 text-left shadow-inner", selectedClipId === clip.id && "ring-2 ring-white", clip.locked && "opacity-60")} style={{ left: clip.start * zoom, width: Math.max(42, visibleDuration(clip) * zoom), borderColor: clip.color ?? track.color, backgroundColor: `${clip.color ?? track.color}24`, cursor: tool === "grabber" ? "grab" : tool === "trim" ? "ew-resize" : tool === "zoomer" ? "zoom-in" : "default" }}><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color ?? track.color }}>{clip.muted ? "MUTED · " : ""}{clip.name}</b><Wave peaks={clip.peaks} color={clip.color ?? track.color} gain={clip.gain} /><span className="absolute bottom-1 left-2 text-[9px] uppercase text-white/45">gain {clip.gain} dB · fade {clip.fadeIn}/{clip.fadeOut}</span></button>)}</div>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} /></div></div>}<div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t border-black bg-[#20242b] px-3 py-2 text-[10px] uppercase text-white/50"><label>Selection start <input type="number" step="0.01" value={selectionStart} onChange={(event) => setSelectionStart(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" /></label><label>Selection end <input type="number" step="0.01" value={selectionEnd} onChange={(event) => setSelectionEnd(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" /></label><button onClick={() => setLoopEnabled(!loopEnabled)} className={loopEnabled ? "bg-cyan-300 px-3 font-black text-black" : "bg-[#30343b] px-3 font-black text-white/60"}>Loop {loopEnabled ? "On" : "Off"}</button></div></section>{regionPanelOpen && <RegionPanel tracks={tracks} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} setRegionPanelOpen={setRegionPanelOpen} editLog={editLog} />}</div>;
}

function Wave({ peaks, color, gain }: { peaks: number[]; color: string; gain: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const canvas = ref.current; const parent = canvas?.parentElement; if (!canvas || !parent) return; const draw = () => { const rect = parent.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.floor(38 * ratio); canvas.style.width = `${rect.width}px`; canvas.style.height = "38px"; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, 38); ctx.fillStyle = color; const visibleCount = Math.max(1, Math.floor(rect.width)); const step = peaks.length / visibleCount; const center = 19; const gainScale = Math.pow(10, gain / 20); for (let x = 0; x < visibleCount; x += 1) { const peak = Math.min(1, (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * gainScale); const height = Math.max(1, peak * 36); ctx.globalAlpha = 0.92; ctx.fillRect(x, center - height / 2, 1, height); } }; draw(); const observer = new ResizeObserver(draw); observer.observe(parent); return () => observer.disconnect(); }, [peaks, color, gain]);
  return <canvas ref={ref} className="mt-1 block w-full bg-black/20" aria-label="Sharp decoded audio waveform" />;
}

function Inspector({ track, clip, updateTrack, updateClip, arm, nudgeLeft, nudgeRight, trimLeft, trimRight, copyClip, cutClip, pasteClip, clearSelection, trimToSelection, tabToTransient, detectTransients, groupSelectedClip, setClipColor, moveClipToTrack, tracks }: { track: Track | null; clip: Clip | null; updateTrack: (id: string, patch: Partial<Track>, label?: string) => void; updateClip: (id: string, patch: Partial<Clip>, label?: string) => void; arm: (id: string) => void; nudgeLeft: () => void; nudgeRight: () => void; trimLeft: (amount: number) => void; trimRight: (amount: number) => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; clearSelection: () => void; trimToSelection: () => void; tabToTransient: () => void; detectTransients: () => void; groupSelectedClip: () => void; setClipColor: () => void; moveClipToTrack: (id: string) => void; tracks: Track[] }) {
  if (!track) return <div className="border-t border-black bg-[#20242b] p-3 text-xs text-white/45">Load audio to inspect track data.</div>;
  const clipping = track.volume + track.inputGain >= 154;
  return <div className="overflow-auto border-t border-black bg-[#20242b] p-3 text-xs"><b className="block truncate uppercase" style={{ color: track.color }}>{track.name}</b><span className="mt-1 block truncate text-white/40">{clip?.name ?? "No clip selected"}</span><div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase"><button onClick={() => updateTrack(track.id, { muted: !track.muted }, "Toggle mute")} className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Mute</button><button onClick={() => updateTrack(track.id, { solo: !track.solo }, "Toggle solo")} className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Solo</button><button onClick={() => arm(track.id)} className={track.armed ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Arm</button></div><label className="mt-2 block uppercase text-white/40">Vol {track.volume}<input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) }, "Set track volume")} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Input {track.inputGain}<input type="range" min="0" max="100" value={track.inputGain} onChange={(event) => updateTrack(track.id, { inputGain: Number(event.target.value) }, "Set input gain")} className="w-full accent-green-300" /></label>{clipping && <button onClick={() => updateTrack(track.id, { volume: 72, inputGain: 62 }, "Fix clipping")} className="mt-2 w-full bg-red-500 py-2 font-black uppercase text-black">Fix clipping</button>}{clip && <div className="mt-3 border-t border-black pt-3"><div className="grid grid-cols-2 gap-1 text-[9px] font-black uppercase"><button onClick={nudgeLeft} className="bg-[#111] py-1 text-white/55">Nudge -</button><button onClick={nudgeRight} className="bg-[#111] py-1 text-white/55">Nudge +</button><button onClick={() => trimLeft(0.05)} className="bg-[#111] py-1 text-white/55">Trim L +</button><button onClick={() => trimLeft(-0.05)} className="bg-[#111] py-1 text-white/55">Trim L -</button><button onClick={() => trimRight(0.05)} className="bg-[#111] py-1 text-white/55">Trim R +</button><button onClick={() => trimRight(-0.05)} className="bg-[#111] py-1 text-white/55">Trim R -</button><button onClick={copyClip} className="bg-[#111] py-1 text-white/55">Copy</button><button onClick={cutClip} className="bg-[#111] py-1 text-white/55">Cut</button><button onClick={pasteClip} className="bg-[#111] py-1 text-white/55">Paste</button><button onClick={clearSelection} className="bg-red-500 py-1 text-black">Clear</button><button onClick={trimToSelection} className="bg-[#111] py-1 text-white/55">Trim Sel</button><button onClick={tabToTransient} className="bg-[#111] py-1 text-white/55">Tab Trans</button><button onClick={detectTransients} className="bg-[#111] py-1 text-white/55">Detect</button><button onClick={groupSelectedClip} className="bg-[#111] py-1 text-white/55">Group</button><button onClick={setClipColor} className="bg-[#111] py-1 text-white/55">Color</button><button onClick={() => updateClip(clip.id, { muted: !clip.muted }, "Toggle clip mute")} className={clip.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Clip Mute</button><button onClick={() => updateClip(clip.id, { locked: !clip.locked }, "Toggle clip lock")} className={clip.locked ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Lock</button></div><label className="mt-2 block uppercase text-white/40">Clip Gain {clip.gain} dB<input type="range" min="-24" max="24" value={clip.gain} onChange={(event) => updateClip(clip.id, { gain: Number(event.target.value) }, "Set clip gain")} className="w-full accent-yellow-300" /></label><label className="mt-2 block uppercase text-white/40">Fade In {clip.fadeIn}<input type="range" min="0" max={visibleDuration(clip)} step="0.01" value={clip.fadeIn} onChange={(event) => updateClip(clip.id, { fadeIn: Number(event.target.value) }, "Set fade in")} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Fade Out {clip.fadeOut}<input type="range" min="0" max={visibleDuration(clip)} step="0.01" value={clip.fadeOut} onChange={(event) => updateClip(clip.id, { fadeOut: Number(event.target.value) }, "Set fade out")} className="w-full accent-pink-300" /></label><label className="mt-2 block uppercase text-white/40">Move to track<select value={track.id} onChange={(event) => moveClipToTrack(event.target.value)} className="mt-1 w-full bg-black p-1 text-green-300">{tracks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}</div>;
}

function RegionPanel({ tracks, selectedClipId, setSelectedTrackId, setSelectedClipId, setRegionPanelOpen, editLog }: { tracks: Track[]; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; setRegionPanelOpen: (value: boolean) => void; editLog: string[] }) {
  const regions = tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip })));
  return <aside className="grid min-h-0 grid-rows-[42px_1fr_180px] border-l border-black bg-[#20242b]"><div className="flex items-center justify-between border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55"><span>Regions</span><button onClick={() => setRegionPanelOpen(false)}>×</button></div><div className="overflow-auto">{regions.map(({ track, clip }) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("w-full border-b border-black px-3 py-2 text-left", selectedClipId === clip.id ? "bg-[#3a3d45]" : "bg-[#252930]")}><b className="block truncate text-[11px] uppercase" style={{ color: clip.color ?? track.color }}>{clip.name}</b><span className="text-[10px] text-white/40">{track.name} · {formatTime(clip.start)} · {visibleDuration(clip).toFixed(2)}s</span></button>)}</div><div className="overflow-auto border-t border-black p-2 text-[10px] text-white/45"><b className="mb-2 block uppercase text-white/70">Edit history</b>{editLog.map((item) => <div key={item} className="border-b border-white/5 py-1">{item}</div>)}</div></aside>;
}

function MixerWorkspace({ tracks, selected, update, arm }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>, label?: string) => void; arm: (id: string) => void }) {
  if (!tracks.length) return <div className="grid h-full place-items-center bg-[#20242b] text-white/55">Import audio in Edit first.</div>;
  return <div className="h-full overflow-auto bg-[#20242b]"><div className="flex min-h-full min-w-max items-stretch border-l border-black">{tracks.map((track, index) => <div key={track.id} className="grid w-[124px] grid-rows-[40px_88px_78px_1fr_58px] border-r border-black bg-[#2d3138] text-center"><div className="flex items-center justify-center border-b border-black bg-[#3a3f47] text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>Ch {index + 1}</div><div className="border-b border-black p-2"><b className="block truncate text-[11px] uppercase text-white/80">{track.name}</b><span className="mt-1 block truncate text-[9px] text-white/35">{track.clips.length} clips</span><button onClick={() => arm(track.id)} className={cn("mt-2 w-full py-1 text-[9px] font-black uppercase", track.armed ? "bg-red-500 text-black" : "bg-[#15171b] text-white/45")}>Rec</button></div><div className="grid grid-cols-2 gap-px border-b border-black p-2 text-[9px] font-black uppercase"><button onClick={() => update(track.id, { muted: !track.muted }, "Toggle mute")} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>Mute</button><button onClick={() => update(track.id, { solo: !track.solo }, "Toggle solo")} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>Solo</button><label className="col-span-2 mt-2 text-white/40">Pan<input type="range" min="-50" max="50" value={track.pan} onChange={(event) => update(track.id, { pan: Number(event.target.value) }, "Set pan")} className="w-full accent-cyan-300" /></label></div><div className="grid grid-cols-[22px_1fr] gap-2 border-b border-black p-3"><div className="relative bg-black"><span className={cn("absolute bottom-0 left-0 right-0", track.volume + track.inputGain >= 154 ? "bg-red-500" : "bg-green-400")} style={{ height: `${Math.min(100, track.volume + track.inputGain / 4)}%` }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) }, "Set fader")} className="h-full w-12 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div><div className="flex items-center justify-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{track.volume.toString().padStart(2, "0")}</div></div>)}</div><div className="fixed bottom-0 left-0 right-0 hidden h-10 border-t border-black bg-[#15171b] px-4 text-xs text-white/45 md:flex md:items-center">Mixer: console-style channel strips, meters, faders, pan, mute, solo, and record-arm. Selected: {selected?.name ?? "none"}</div></div>;
}

function ExportWorkspace({ tracks, selected }: { tracks: Track[]; selected: Track | null }) {
  function downloadClip(track: Track, clip: Clip) { const a = document.createElement("a"); a.href = clip.url; a.download = `${fileSlug(track.name)}-${fileSlug(clip.name)}.${clipExt(clip)}`; a.click(); }
  return <div className="grid h-full place-items-center bg-[#20242b] p-6"><div className="text-center"><h2 className="text-3xl font-black uppercase tracking-widest text-cyan-100">Export</h2><p className="mt-3 text-sm text-white/55">Downloads real source audio from this session.</p><button disabled={!selected?.clips[0]} onClick={() => selected?.clips[0] && downloadClip(selected, selected.clips[0])} className="mt-5 bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download Selected Track First Clip</button><button disabled={!tracks.length} onClick={() => tracks.forEach((track) => track.clips.forEach((clip) => downloadClip(track, clip)))} className="ml-3 mt-5 border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download All Clips</button></div></div>;
}
