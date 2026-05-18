"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type Mode = "edit" | "mix" | "beat" | "export" | "files";
type Tool = "smart" | "selector" | "grabber" | "trim" | "pencil" | "scrubber" | "zoomer";
type EditMode = "slip" | "grid" | "spot" | "shuffle";
type Clip = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  duration: number;
  peaks: number[];
  start: number;
  trimStart: number;
  trimEnd: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
  muted: boolean;
  locked: boolean;
  missing?: boolean;
  color?: string;
};
type Track = {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  inputGain: number;
  clips: Clip[];
};
type SavedSession = {
  id: string;
  title: string;
  bpm: number;
  sampleRate: number;
  updatedAt: string;
  tracks: Track[];
  snapshots: Snapshot[];
};
type Snapshot = { id: string; label: string; createdAt: string; tracks: Track[] };
type History = { label: string; tracks: Track[] };

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e", "#8ee3f5"];
const tools: Tool[] = ["smart", "selector", "grabber", "trim", "pencil", "scrubber", "zoomer"];
const editModes: EditMode[] = ["slip", "grid", "spot", "shuffle"];
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const sessionIndexKey = "ems.studio.sessions.index.v2";
const autosaveKey = "ems.studio.autosave.v2";
const lockKey = "ems.studio.lock.v2";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ").trim() || "Audio Track";
}

function slug(value: string) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}

function cloneTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) }));
}

function persistableTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: "", missing: true })) }));
}

function restoreTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: "", missing: true })) }));
}

function visibleDuration(clip: Clip) {
  return Math.max(0.05, clip.duration - clip.trimStart - clip.trimEnd);
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const min = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}.${cs.toString().padStart(2, "0")}`;
}

function sessionKey(id: string) {
  return `ems.studio.session.${id}.v2`;
}

function loadIndex(): { id: string; title: string; updatedAt: string }[] {
  try {
    return JSON.parse(localStorage.getItem(sessionIndexKey) || "[]");
  } catch {
    return [];
  }
}

function saveIndex(index: { id: string; title: string; updatedAt: string }[]) {
  localStorage.setItem(sessionIndexKey, JSON.stringify(index.slice(0, 20)));
}

async function decodeAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const count = 1400;
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
    return { duration: buffer.duration, peaks, sampleRate: buffer.sampleRate };
  } finally {
    await ctx.close();
  }
}

function clipExt(clip: Clip) {
  const ext = clip.name.split(".").pop();
  if (ext && ext.length <= 5) return ext.toLowerCase();
  if (clip.type.includes("wav")) return "wav";
  if (clip.type.includes("mpeg")) return "mp3";
  if (clip.type.includes("webm")) return "webm";
  return "audio";
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<Tool>("smart");
  const [editMode, setEditMode] = useState<EditMode>("grid");
  const [tracks, setTracks] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(() => uid("session"));
  const [title, setTitle] = useState("Untitled Session");
  const [bpm, setBpm] = useState(92);
  const [sampleRate, setSampleRate] = useState(48000);
  const [zoom, setZoom] = useState(110);
  const [playhead, setPlayhead] = useState(0);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(4);
  const [loop, setLoop] = useState(false);
  const [nudge, setNudge] = useState(0.1);
  const [grid, setGrid] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Not saved");
  const [offline, setOffline] = useState(false);
  const [lockWarning, setLockWarning] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [redoHistory, setRedoHistory] = useState<History[]>([]);
  const [editLog, setEditLog] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<HTMLAudioElement[]>([]);
  const timer = useRef<number | null>(null);
  const playOrigin = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tabId = useRef(uid("tab"));

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks[0] ?? null;
  const selectedClipRef = useMemo(() => {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  }, [tracks, selectedClipId]);
  const selectedClip = selectedClipRef?.clip ?? selectedTrack?.clips[0] ?? null;
  const armedTrack = tracks.find((track) => track.armed) ?? selectedTrack;
  const sessionEnd = Math.max(10, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + visibleDuration(clip))));
  const missingClips = tracks.flatMap((track) => track.clips.filter((clip) => clip.missing || !clip.url));

  const markDirty = useCallback((label: string) => {
    setDirty(true);
    setSaveStatus("Unsaved changes");
    setEditLog((current) => [`${new Date().toLocaleTimeString()}  ${label}`, ...current].slice(0, 60));
  }, []);

  const commit = useCallback((label: string, recipe: (draft: Track[]) => Track[]) => {
    setTracks((current) => {
      setHistory((items) => [{ label, tracks: cloneTracks(current) }, ...items].slice(0, 80));
      setRedoHistory([]);
      return recipe(cloneTracks(current));
    });
    markDirty(label);
  }, [markDirty]);

  const buildSession = useCallback((id = sessionId, sessionTitle = title): SavedSession => ({
    id,
    title: sessionTitle,
    bpm,
    sampleRate,
    updatedAt: new Date().toISOString(),
    tracks: persistableTracks(tracks),
    snapshots: snapshots.map((snapshot) => ({ ...snapshot, tracks: persistableTracks(snapshot.tracks) })),
  }), [bpm, sampleRate, sessionId, snapshots, title, tracks]);

  const autosave = useCallback(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(autosaveKey, JSON.stringify(buildSession()));
    setSaveStatus(`Autosaved ${new Date().toLocaleTimeString()}`);
  }, [buildSession]);

  const stopTransport = useCallback((reset = false) => {
    players.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    players.current = [];
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    if (reset) setPlayhead(0);
  }, []);

  useEffect(() => {
    setRecent(loadIndex());
    setOffline(!navigator.onLine);
    const existingLock = localStorage.getItem(lockKey);
    if (existingLock && existingLock !== tabId.current) setLockWarning("Studio is open in another tab. Save before editing from multiple windows.");
    localStorage.setItem(lockKey, tabId.current);
    const online = () => setOffline(false);
    const offlineNow = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineNow);
    return () => {
      if (localStorage.getItem(lockKey) === tabId.current) localStorage.removeItem(lockKey);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineNow);
      tracksRef.current.flatMap((track) => track.clips).forEach((clip) => clip.url && URL.revokeObjectURL(clip.url));
      stopTransport();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [stopTransport]);

  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(autosave, 1200);
    return () => window.clearTimeout(id);
  }, [autosave, dirty, tracks, title, bpm, sampleRate, snapshots]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        playing ? stopTransport() : playTransport();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveSession();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (event.key.toLowerCase() === "b") splitAtPlayhead();
      if (event.key === "Delete" || event.key === "Backspace") deleteSelectedClip();
      if (event.key.toLowerCase() === "t") setZoom((value) => Math.min(480, value + 30));
      if (event.key.toLowerCase() === "r") setRecording((current) => current);
      if (event.key === "ArrowLeft") nudgeSelected(-1);
      if (event.key === "ArrowRight") nudgeSelected(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function saveSession(customTitle = title, forceNew = false) {
    const id = forceNew ? uid("session") : sessionId;
    const saved = buildSession(id, customTitle);
    localStorage.setItem(sessionKey(id), JSON.stringify(saved));
    const nextIndex = [{ id, title: customTitle, updatedAt: saved.updatedAt }, ...loadIndex().filter((item) => item.id !== id)];
    saveIndex(nextIndex);
    setRecent(nextIndex.slice(0, 20));
    setSessionId(id);
    setTitle(customTitle);
    setDirty(false);
    setSaveStatus(`Saved ${new Date().toLocaleTimeString()}`);
  }

  function saveAs() {
    const name = window.prompt("Save session as", title);
    if (!name) return;
    saveSession(name, true);
  }

  function newSession() {
    if (dirty && !window.confirm("Start a new session and discard unsaved changes?")) return;
    stopTransport(true);
    tracks.flatMap((track) => track.clips).forEach((clip) => clip.url && URL.revokeObjectURL(clip.url));
    setTracks([]);
    setSelectedTrackId(null);
    setSelectedClipId(null);
    setSessionId(uid("session"));
    setTitle("Untitled Session");
    setBpm(92);
    setSampleRate(48000);
    setSnapshots([]);
    setHistory([]);
    setRedoHistory([]);
    setDirty(false);
    setSaveStatus("New session");
  }

  function openSession(id: string) {
    if (dirty && !window.confirm("Open another session and discard unsaved changes?")) return;
    const raw = localStorage.getItem(sessionKey(id));
    if (!raw) return setError("Saved session was not found in this browser.");
    const saved = JSON.parse(raw) as SavedSession;
    stopTransport(true);
    setSessionId(saved.id);
    setTitle(saved.title);
    setBpm(saved.bpm);
    setSampleRate(saved.sampleRate);
    setTracks(restoreTracks(saved.tracks));
    setSnapshots(saved.snapshots.map((snapshot) => ({ ...snapshot, tracks: restoreTracks(snapshot.tracks) })));
    setSelectedTrackId(saved.tracks[0]?.id ?? null);
    setSelectedClipId(saved.tracks[0]?.clips[0]?.id ?? null);
    setDirty(false);
    setSaveStatus("Opened; relink missing audio files");
    setMode("edit");
  }

  function restoreAutosave() {
    const raw = localStorage.getItem(autosaveKey);
    if (!raw) return setError("No autosave exists in this browser yet.");
    const saved = JSON.parse(raw) as SavedSession;
    stopTransport(true);
    setSessionId(saved.id);
    setTitle(`${saved.title} restored`);
    setBpm(saved.bpm);
    setSampleRate(saved.sampleRate);
    setTracks(restoreTracks(saved.tracks));
    setSnapshots(saved.snapshots.map((snapshot) => ({ ...snapshot, tracks: restoreTracks(snapshot.tracks) })));
    setDirty(true);
    setSaveStatus("Autosave restored; relink source audio");
    setMode("edit");
  }

  function snapshot() {
    const label = window.prompt("Snapshot name", `Snapshot ${snapshots.length + 1}`);
    if (!label) return;
    setSnapshots((items) => [{ id: uid("snapshot"), label, createdAt: new Date().toISOString(), tracks: cloneTracks(tracks) }, ...items].slice(0, 30));
    markDirty(`Snapshot: ${label}`);
  }

  function revertSnapshot(id: string) {
    const item = snapshots.find((snapshot) => snapshot.id === id);
    if (!item) return;
    if (!window.confirm(`Revert to ${item.label}?`)) return;
    commit(`Revert snapshot: ${item.label}`, () => cloneTracks(item.tracks));
  }

  async function createClipFromBlob(blob: Blob, fileName: string, type: string, targetTrackId?: string, start = 0) {
    const decoded = await decodeAudio(blob);
    const color = colors[tracks.length % colors.length];
    const clip: Clip = {
      id: uid("clip"),
      name: fileName,
      url: URL.createObjectURL(blob),
      type: type || "audio/*",
      size: blob.size,
      duration: decoded.duration,
      peaks: decoded.peaks,
      start,
      trimStart: 0,
      trimEnd: 0,
      fadeIn: 0,
      fadeOut: 0,
      gain: 0,
      muted: false,
      locked: false,
      color,
    };
    setSampleRate(decoded.sampleRate);
    if (targetTrackId) {
      commit("Record/import clip", (draft) => draft.map((track) => track.id === targetTrackId ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
      setSelectedTrackId(targetTrackId);
      setSelectedClipId(clip.id);
      return;
    }
    const track: Track = {
      id: uid("track"),
      name: cleanName(fileName),
      color,
      armed: tracks.length === 0,
      muted: false,
      solo: false,
      volume: 78,
      pan: 0,
      inputGain: 60,
      clips: [clip],
    };
    commit("Import audio track", (draft) => [...draft, track]);
    setSelectedTrackId(track.id);
    setSelectedClipId(clip.id);
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) return setError("Use a real audio file: WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.");
    setBusy(true);
    setError(null);
    try {
      for (const file of audioFiles) await createClipFromBlob(file, file.name, file.type || "audio/*");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio could not be decoded. Try WAV or MP3.");
    } finally {
      setBusy(false);
    }
  }

  async function relinkClip(clipId: string, file: File) {
    setBusy(true);
    try {
      const decoded = await decodeAudio(file);
      const url = URL.createObjectURL(file);
      commit("Relink missing audio", (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, name: file.name, url, type: file.type || "audio/*", size: file.size, duration: decoded.duration, peaks: decoded.peaks, missing: false } : clip) })));
      setSampleRate(decoded.sampleRate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not relink this file.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      rec.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) return;
        const target = armedTrack?.id;
        await createClipFromBlob(blob, `Take ${new Date().toLocaleTimeString()}.webm`, rec.mimeType || "audio/webm", target, playhead);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      markDirty("Start recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone recording failed.");
    }
  }

  function playTransport() {
    if (playing) return;
    const soloed = tracks.filter((track) => track.solo);
    const sourceTracks = soloed.length ? soloed : tracks;
    const clips = sourceTracks.flatMap((track) => track.muted ? [] : track.clips.filter((clip) => !clip.muted && !clip.missing && clip.url && playhead < clip.start + visibleDuration(clip)).map((clip) => ({ track, clip })));
    if (!clips.length) return setError("No playable audio. Import or relink audio first.");
    playOrigin.current = performance.now() / 1000 - playhead;
    players.current = clips.map(({ track, clip }) => {
      const audio = new Audio(clip.url);
      audio.volume = Math.min(1, Math.max(0, (track.volume / 100) * Math.pow(10, clip.gain / 20)));
      audio.currentTime = Math.max(0, clip.trimStart + playhead - clip.start);
      const wait = Math.max(0, clip.start - playhead) * 1000;
      window.setTimeout(() => void audio.play().catch((err) => setError(err instanceof Error ? err.message : "Playback failed.")), wait);
      return audio;
    });
    setPlaying(true);
    timer.current = window.setInterval(() => {
      const next = performance.now() / 1000 - playOrigin.current;
      if (loop && next >= selectionEnd) {
        stopTransport();
        setPlayhead(selectionStart);
        window.setTimeout(playTransport, 0);
        return;
      }
      setPlayhead(next);
      if (next >= sessionEnd) stopTransport();
    }, 40);
  }

  function updateTrack(id: string, patch: Partial<Track>, label = "Update track") {
    commit(label, (draft) => draft.map((track) => track.id === id ? { ...track, ...patch, clips: patch.clips ?? track.clips } : track));
  }

  function updateClip(id: string, patch: Partial<Clip>, label = "Update clip") {
    commit(label, (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === id && !clip.locked ? { ...clip, ...patch } : clip) })));
  }

  function arm(id: string) {
    commit("Arm track", (draft) => draft.map((track) => ({ ...track, armed: track.id === id })));
    setSelectedTrackId(id);
  }

  function undo() {
    const item = history[0];
    if (!item) return;
    setRedoHistory((items) => [{ label: "Redo", tracks: cloneTracks(tracks) }, ...items].slice(0, 80));
    setTracks(cloneTracks(item.tracks));
    setHistory((items) => items.slice(1));
    markDirty(`Undo: ${item.label}`);
  }

  function redo() {
    const item = redoHistory[0];
    if (!item) return;
    setHistory((items) => [{ label: "Undo", tracks: cloneTracks(tracks) }, ...items].slice(0, 80));
    setTracks(cloneTracks(item.tracks));
    setRedoHistory((items) => items.slice(1));
    markDirty("Redo edit");
  }

  function snap(value: number) {
    return editMode === "grid" ? Math.max(0, Math.round(value / grid) * grid) : Math.max(0, value);
  }

  function nudgeSelected(direction: -1 | 1) {
    if (!selectedClipRef || selectedClipRef.clip.locked) return;
    updateClip(selectedClipRef.clip.id, { start: snap(selectedClipRef.clip.start + direction * nudge) }, direction < 0 ? "Nudge left" : "Nudge right");
  }

  function splitAtPlayhead() {
    if (!selectedClipRef || selectedClipRef.clip.locked) return;
    const { track, clip } = selectedClipRef;
    const local = playhead - clip.start;
    if (local <= 0.02 || local >= visibleDuration(clip) - 0.02) return;
    const left: Clip = { ...clip, id: uid("clip"), name: `${clip.name} A`, trimEnd: clip.trimEnd + visibleDuration(clip) - local };
    const right: Clip = { ...clip, id: uid("clip"), name: `${clip.name} B`, start: clip.start + local, trimStart: clip.trimStart + local };
    commit("Separate clip", (draft) => draft.map((item) => item.id === track.id ? { ...item, clips: item.clips.flatMap((candidate) => candidate.id === clip.id ? [left, right] : [candidate]) } : item));
    setSelectedClipId(right.id);
  }

  function duplicateClip() {
    if (!selectedClipRef) return;
    const copy: Clip = { ...selectedClipRef.clip, id: uid("clip"), name: `${selectedClipRef.clip.name} copy`, start: snap(selectedClipRef.clip.start + visibleDuration(selectedClipRef.clip) + nudge), locked: false };
    commit("Duplicate clip", (draft) => draft.map((track) => track.id === selectedClipRef.track.id ? { ...track, clips: [...track.clips, copy].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(copy.id);
  }

  function deleteSelectedClip() {
    if (!selectedClip) return;
    commit("Delete clip", (draft) => draft.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selectedClip.id) })).filter((track) => track.clips.length));
    setSelectedClipId(null);
  }

  function renameClip() {
    if (!selectedClip) return;
    const next = window.prompt("Rename clip", selectedClip.name);
    if (next) updateClip(selectedClip.id, { name: next }, "Rename clip");
  }

  function copyClip(cut = false) {
    if (!selectedClip) return;
    setClipboard({ ...selectedClip });
    markDirty(cut ? "Cut clip" : "Copy clip");
    if (cut) deleteSelectedClip();
  }

  function pasteClip() {
    if (!clipboard || !selectedTrack) return;
    const pasted: Clip = { ...clipboard, id: uid("clip"), name: `${clipboard.name} paste`, start: snap(playhead), locked: false };
    commit("Paste clip", (draft) => draft.map((track) => track.id === selectedTrack.id ? { ...track, clips: [...track.clips, pasted].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(pasted.id);
  }

  function moveClipToTrack(trackId: string) {
    if (!selectedClipRef || selectedClipRef.track.id === trackId) return;
    const clip = selectedClipRef.clip;
    commit("Move clip to track", (draft) => draft.map((track) => {
      if (track.id === selectedClipRef.track.id) return { ...track, clips: track.clips.filter((item) => item.id !== clip.id) };
      if (track.id === trackId) return { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) };
      return track;
    }).filter((track) => track.clips.length));
  }

  function trimEdge(edge: "left" | "right", amount: number) {
    if (!selectedClip) return;
    if (edge === "left") updateClip(selectedClip.id, { trimStart: Math.max(0, Math.min(selectedClip.duration - 0.05, selectedClip.trimStart + amount)), start: Math.max(0, selectedClip.start + amount) }, "Trim left edge");
    else updateClip(selectedClip.id, { trimEnd: Math.max(0, Math.min(selectedClip.duration - 0.05, selectedClip.trimEnd + amount)) }, "Trim right edge");
  }

  function exportArchive() {
    const archive = { ...buildSession(), exportedAt: new Date().toISOString(), note: "Audio blobs are not embedded. Relink source audio after restore until Supabase Storage upload is wired." };
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}-session-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus("Archive exported");
  }

  function downloadClip(track: Track, clip: Clip) {
    if (!clip.url) return setError("That clip is missing its source audio. Relink it first.");
    const a = document.createElement("a");
    a.href = clip.url;
    a.download = `${slug(track.name)}-${slug(clip.name)}.${clipExt(clip)}`;
    a.click();
  }

  const toolbarButton = "h-8 border border-black bg-[#30343b] px-3 font-black";

  return <div className="h-dvh overflow-hidden bg-[#111316] text-[#d8d8d8]"><div className="grid h-full grid-rows-[34px_104px_1fr]">
    <div className="flex items-center border-b border-black bg-[#26282c] text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"><button onClick={() => setMode("edit")} className="h-full border-r border-black px-4 text-cyan-200">EMS Studio</button>{(["edit", "mix", "beat", "export", "files"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("h-full border-r border-black px-5", mode === item ? "bg-[#d8d2bd] text-black" : "bg-[#303238] text-white/72 hover:bg-[#3b3e45]")}>{item}</button>)}<input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); setSaveStatus("Unsaved changes"); }} className="ml-3 w-72 bg-black px-3 py-1 font-mono text-cyan-200 outline-none" /><span className={cn("ml-3 px-2 py-1", dirty ? "bg-yellow-400 text-black" : "bg-green-500 text-black")}>{dirty ? "Dirty" : "Saved"}</span><span className="ml-2 text-white/45">{saveStatus}</span><div className="ml-auto flex h-full items-center gap-2 px-3"><span>Counter</span><span className="min-w-[96px] bg-black px-3 py-1 font-mono text-green-300">{formatTime(playhead)}</span></div></div>
    <div className="grid grid-rows-2 border-b border-black bg-[#1d2025] text-[11px] uppercase tracking-widest text-white/70"><div className="flex items-center gap-2 overflow-x-auto px-3"><button onClick={newSession} className={toolbarButton}>New</button><button onClick={() => saveSession()} className={toolbarButton}>Save</button><button onClick={saveAs} className={toolbarButton}>Save As</button><button onClick={restoreAutosave} className={toolbarButton}>Restore</button><button onClick={snapshot} className={toolbarButton}>Snapshot</button><button onClick={exportArchive} className={toolbarButton}>Archive</button><button onClick={() => stopTransport(true)} className={toolbarButton}>|&lt;</button><button onClick={() => stopTransport()} className={toolbarButton}>Stop</button><button onClick={playing ? () => stopTransport() : playTransport} disabled={!tracks.length} className={cn("h-8 min-w-16 border border-black px-4 font-black disabled:opacity-35", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Pause" : "Play"}</button><button onClick={toggleRecord} className={cn("h-8 border border-black px-4 font-black text-black", recording ? "bg-red-500 animate-pulse" : "bg-red-400")}>{recording ? "Stop Rec" : "Record"}</button><label className="flex h-8 cursor-pointer items-center border border-black bg-[#353941] px-4 font-black text-cyan-100">{busy ? "Importing" : "Import"}<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label><span className="ml-auto whitespace-nowrap border border-black bg-[#121417] px-3 py-2">Target: <b className="text-red-300">{armedTrack?.name ?? "none"}</b></span></div><div className="flex items-center gap-2 overflow-x-auto px-3"><button onClick={undo} className={toolbarButton}>Undo</button><button onClick={redo} className={toolbarButton}>Redo</button><button onClick={() => setZoom((value) => Math.max(35, value - 30))} className={toolbarButton}>Zoom -</button><button onClick={() => setZoom((value) => Math.min(520, value + 30))} className={toolbarButton}>Zoom +</button><button onClick={() => setZoom(Math.max(45, Math.min(180, 1200 / sessionEnd)))} className={toolbarButton}>Fit</button>{tools.map((item) => <button key={item} onClick={() => setTool(item)} className={cn("h-7 border border-black px-2 font-black", tool === item ? "bg-[#d8d2bd] text-black" : "bg-[#30343b]")}>{item}</button>)}{editModes.map((item) => <button key={item} onClick={() => setEditMode(item)} className={cn("h-7 border border-black px-2 font-black", editMode === item ? "bg-cyan-300 text-black" : "bg-[#30343b]")}>{item}</button>)}<label>Nudge <select value={nudge} onChange={(event) => setNudge(Number(event.target.value))} className="bg-black px-2 py-1 text-green-300"><option value={0.01}>10ms</option><option value={0.05}>50ms</option><option value={0.1}>100ms</option><option value={0.25}>1/4s</option><option value={1}>1s</option></select></label><label>BPM <input value={bpm} onChange={(event) => { setBpm(Number(event.target.value) || 92); setDirty(true); }} className="w-16 bg-black px-2 py-1 text-green-300" /></label><label>SR <select value={sampleRate} onChange={(event) => { setSampleRate(Number(event.target.value)); setDirty(true); }} className="bg-black px-2 py-1 text-green-300"><option value={44100}>44.1</option><option value={48000}>48</option><option value={96000}>96</option></select></label></div></div>
    {(error || lockWarning || missingClips.length > 0 || offline) && <div className="absolute left-3 right-3 top-[142px] z-40 border border-yellow-400/50 bg-yellow-950 px-4 py-3 text-sm font-bold text-yellow-100">{error ?? lockWarning ?? (offline ? "Offline: local save still works, cloud sync is unavailable." : `${missingClips.length} clip${missingClips.length === 1 ? " is" : "s are"} missing source audio. Relink to play.`)}</div>}
    <main className="min-h-0 overflow-hidden bg-[#171a1f]">{mode === "beat" && <BeatMachineProClient studioMode />}{mode === "edit" && <EditWorkspace tracks={tracks} selectedTrack={selectedTrack} selectedClip={selectedClip} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} importFiles={importFiles} relinkClip={relinkClip} updateTrack={updateTrack} updateClip={updateClip} arm={arm} tool={tool} zoom={zoom} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} selectionStart={selectionStart} selectionEnd={selectionEnd} setSelectionStart={setSelectionStart} setSelectionEnd={setSelectionEnd} loop={loop} setLoop={setLoop} splitAtPlayhead={splitAtPlayhead} duplicateClip={duplicateClip} deleteSelectedClip={deleteSelectedClip} renameClip={renameClip} copyClip={() => copyClip(false)} cutClip={() => copyClip(true)} pasteClip={pasteClip} nudgeLeft={() => nudgeSelected(-1)} nudgeRight={() => nudgeSelected(1)} trimLeft={(amount) => trimEdge("left", amount)} trimRight={(amount) => trimEdge("right", amount)} moveClipToTrack={moveClipToTrack} editLog={editLog} />}{mode === "mix" && <MixerWorkspace tracks={tracks} selected={selectedTrack} update={updateTrack} arm={arm} />}{mode === "export" && <ExportWorkspace tracks={tracks} selected={selectedTrack} downloadClip={downloadClip} exportArchive={exportArchive} />}{mode === "files" && <FilesWorkspace recent={recent} openSession={openSession} snapshots={snapshots} revertSnapshot={revertSnapshot} snapshot={snapshot} sessionId={sessionId} title={title} bpm={bpm} sampleRate={sampleRate} missingClips={missingClips} offline={offline} lockWarning={lockWarning} />}</main>
  </div></div>;
}

function EditWorkspace({ tracks, selectedTrack, selectedClip, selectedClipId, setSelectedTrackId, setSelectedClipId, importFiles, relinkClip, updateTrack, updateClip, arm, tool, zoom, playhead, setPlayhead, sessionEnd, selectionStart, selectionEnd, setSelectionStart, setSelectionEnd, loop, setLoop, splitAtPlayhead, duplicateClip, deleteSelectedClip, renameClip, copyClip, cutClip, pasteClip, nudgeLeft, nudgeRight, trimLeft, trimRight, moveClipToTrack, editLog }: { tracks: Track[]; selectedTrack: Track | null; selectedClip: Clip | null; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; relinkClip: (clipId: string, file: File) => Promise<void>; updateTrack: (id: string, patch: Partial<Track>, label?: string) => void; updateClip: (id: string, patch: Partial<Clip>, label?: string) => void; arm: (id: string) => void; tool: Tool; zoom: number; playhead: number; setPlayhead: (seconds: number) => void; sessionEnd: number; selectionStart: number; selectionEnd: number; setSelectionStart: (seconds: number) => void; setSelectionEnd: (seconds: number) => void; loop: boolean; setLoop: (value: boolean) => void; splitAtPlayhead: () => void; duplicateClip: () => void; deleteSelectedClip: () => void; renameClip: () => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; nudgeLeft: () => void; nudgeRight: () => void; trimLeft: (amount: number) => void; trimRight: (amount: number) => void; moveClipToTrack: (id: string) => void; editLog: string[] }) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 480);
  return <div className="grid h-full min-h-0 grid-cols-[270px_1fr_260px] bg-[#1b1f26]"><div className="grid min-h-0 grid-rows-[42px_1fr_250px] border-r border-black bg-[#252930]"><div className="flex items-center border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55">Tracks</div><div className="overflow-auto">{tracks.length === 0 && <div className="px-3 py-4 text-xs leading-5 text-white/45">No tracks loaded.</div>}{tracks.map((track) => <button key={track.id} onClick={() => setSelectedTrackId(track.id)} className={cn("grid min-h-[86px] w-full grid-cols-[8px_1fr_74px] border-b border-black text-left", selectedTrack?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]")}><span style={{ backgroundColor: track.color }} /><span className="min-w-0 px-3 py-2"><b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b><span className="mt-1 block text-[10px] uppercase tracking-wide text-white/40">{track.clips.length} clip{track.clips.length === 1 ? "" : "s"}</span><span className="mt-2 block h-2 bg-black"><span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} /></span></span><span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase"><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { muted: !track.muted }, "Toggle mute"); }} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>M</button><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }, "Toggle solo"); }} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>S</button><button onClick={(event) => { event.stopPropagation(); arm(track.id); }} className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45"}>Rec</button></span></button>)}</div><Inspector track={selectedTrack} clip={selectedClip} tracks={tracks} updateTrack={updateTrack} updateClip={updateClip} arm={arm} splitAtPlayhead={splitAtPlayhead} duplicateClip={duplicateClip} deleteSelectedClip={deleteSelectedClip} renameClip={renameClip} copyClip={copyClip} cutClip={cutClip} pasteClip={pasteClip} nudgeLeft={nudgeLeft} nudgeRight={nudgeRight} trimLeft={trimLeft} trimRight={trimRight} moveClipToTrack={moveClipToTrack} /></div><section className="grid min-h-0 grid-rows-[42px_1fr_58px] overflow-hidden bg-[#171a1f]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}><div className="relative overflow-hidden border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}><div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} />{seconds.map((second) => <button key={second} onClick={() => setPlayhead(second)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: second * zoom, width: zoom }}>{second % 2 === 0 ? formatTime(second) : second}</button>)}</div>{tracks.length === 0 ? <div className="grid h-full place-items-center"><div className="text-center"><h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2><p className="mt-3 text-sm text-white/50">Import, record, save, restore, relink, edit, mix, and export real audio.</p><label className="mt-5 inline-block cursor-pointer bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">Import Audio<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label></div></div> : <div className="overflow-auto"><div className="relative" style={{ width: timelineWidth }}>{tracks.map((track) => <div key={track.id} className="relative h-[86px] border-b border-black bg-[#1b1f26]"><div className="absolute inset-0">{seconds.map((second) => <span key={second} className="absolute bottom-0 top-0 border-r border-black/70" style={{ left: second * zoom, width: zoom }} />)}</div><div className="absolute bottom-0 top-0 bg-cyan-300/10" style={{ left: selectionStart * zoom, width: Math.max(1, (selectionEnd - selectionStart) * zoom) }} />{track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}{track.clips.map((clip) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("absolute top-[10px] h-[66px] border px-3 text-left shadow-inner", selectedClipId === clip.id && "ring-2 ring-white", clip.locked && "opacity-60", clip.missing && "border-dashed")} style={{ left: clip.start * zoom, width: Math.max(50, visibleDuration(clip) * zoom), borderColor: clip.color ?? track.color, backgroundColor: clip.missing ? "#3b1d1d" : `${clip.color ?? track.color}24`, cursor: tool === "grabber" ? "grab" : tool === "trim" ? "ew-resize" : tool === "zoomer" ? "zoom-in" : "default" }}><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color ?? track.color }}>{clip.missing ? "MISSING · " : ""}{clip.muted ? "MUTED · " : ""}{clip.name}</b>{clip.missing ? <label className="mt-2 inline-block cursor-pointer bg-red-400 px-2 py-1 text-[9px] font-black uppercase text-black">Relink<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" className="sr-only" onClick={(event) => event.stopPropagation()} onChange={(event) => event.target.files?.[0] && void relinkClip(clip.id, event.target.files[0])} /></label> : <Wave peaks={clip.peaks} color={clip.color ?? track.color} gain={clip.gain} />}<span className="absolute bottom-1 left-2 text-[9px] uppercase text-white/45">gain {clip.gain} dB · fade {clip.fadeIn}/{clip.fadeOut}</span></button>)}</div>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} /></div></div>}<div className="grid grid-cols-[1fr_1fr_auto] gap-3 border-t border-black bg-[#20242b] px-3 py-2 text-[10px] uppercase text-white/50"><label>Selection start <input type="number" step="0.01" value={selectionStart} onChange={(event) => setSelectionStart(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" /></label><label>Selection end <input type="number" step="0.01" value={selectionEnd} onChange={(event) => setSelectionEnd(Number(event.target.value))} className="ml-2 w-24 bg-black px-2 py-1 font-mono text-green-300" /></label><button onClick={() => setLoop(!loop)} className={loop ? "bg-cyan-300 px-3 font-black text-black" : "bg-[#30343b] px-3 font-black text-white/60"}>Loop {loop ? "On" : "Off"}</button></div></section><RegionPanel tracks={tracks} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} editLog={editLog} /></div>;
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
      canvas.height = Math.floor(38 * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = "38px";
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, 38);
      ctx.fillStyle = color;
      const visible = Math.max(1, Math.floor(rect.width));
      const step = peaks.length / visible;
      const center = 19;
      const gainScale = Math.pow(10, gain / 20);
      for (let x = 0; x < visible; x += 1) {
        const peak = Math.min(1, (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * gainScale);
        const height = Math.max(1, peak * 36);
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x, center - height / 2, 1, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [peaks, color, gain]);
  return <canvas ref={ref} className="mt-1 block w-full bg-black/20" aria-label="Decoded audio waveform" />;
}

function Inspector({ track, clip, tracks, updateTrack, updateClip, arm, splitAtPlayhead, duplicateClip, deleteSelectedClip, renameClip, copyClip, cutClip, pasteClip, nudgeLeft, nudgeRight, trimLeft, trimRight, moveClipToTrack }: { track: Track | null; clip: Clip | null; tracks: Track[]; updateTrack: (id: string, patch: Partial<Track>, label?: string) => void; updateClip: (id: string, patch: Partial<Clip>, label?: string) => void; arm: (id: string) => void; splitAtPlayhead: () => void; duplicateClip: () => void; deleteSelectedClip: () => void; renameClip: () => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; nudgeLeft: () => void; nudgeRight: () => void; trimLeft: (amount: number) => void; trimRight: (amount: number) => void; moveClipToTrack: (id: string) => void }) {
  if (!track) return <div className="border-t border-black bg-[#20242b] p-3 text-xs text-white/45">Load audio to inspect track data.</div>;
  const clipping = track.volume + track.inputGain >= 154;
  return <div className="overflow-auto border-t border-black bg-[#20242b] p-3 text-xs"><b className="block truncate uppercase" style={{ color: track.color }}>{track.name}</b><span className="mt-1 block truncate text-white/40">{clip?.name ?? "No clip selected"}</span><div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase"><button onClick={() => updateTrack(track.id, { muted: !track.muted }, "Toggle mute")} className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Mute</button><button onClick={() => updateTrack(track.id, { solo: !track.solo }, "Toggle solo")} className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Solo</button><button onClick={() => arm(track.id)} className={track.armed ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Arm</button></div><label className="mt-2 block uppercase text-white/40">Vol {track.volume}<input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) }, "Set track volume")} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Input {track.inputGain}<input type="range" min="0" max="100" value={track.inputGain} onChange={(event) => updateTrack(track.id, { inputGain: Number(event.target.value) }, "Set input gain")} className="w-full accent-green-300" /></label>{clipping && <button onClick={() => updateTrack(track.id, { volume: 72, inputGain: 62 }, "Fix clipping")} className="mt-2 w-full bg-red-500 py-2 font-black uppercase text-black">Fix clipping</button>}{clip && <div className="mt-3 border-t border-black pt-3"><div className="grid grid-cols-2 gap-1 text-[9px] font-black uppercase"><button onClick={splitAtPlayhead} className="bg-[#111] py-1 text-white/55">Separate</button><button onClick={duplicateClip} className="bg-[#111] py-1 text-white/55">Duplicate</button><button onClick={renameClip} className="bg-[#111] py-1 text-white/55">Rename</button><button onClick={deleteSelectedClip} className="bg-red-500 py-1 text-black">Delete</button><button onClick={nudgeLeft} className="bg-[#111] py-1 text-white/55">Nudge -</button><button onClick={nudgeRight} className="bg-[#111] py-1 text-white/55">Nudge +</button><button onClick={() => trimLeft(0.05)} className="bg-[#111] py-1 text-white/55">Trim L +</button><button onClick={() => trimRight(0.05)} className="bg-[#111] py-1 text-white/55">Trim R +</button><button onClick={copyClip} className="bg-[#111] py-1 text-white/55">Copy</button><button onClick={cutClip} className="bg-[#111] py-1 text-white/55">Cut</button><button onClick={pasteClip} className="bg-[#111] py-1 text-white/55">Paste</button><button onClick={() => updateClip(clip.id, { locked: !clip.locked }, "Toggle clip lock")} className={clip.locked ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Lock</button><button onClick={() => updateClip(clip.id, { muted: !clip.muted }, "Toggle clip mute")} className={clip.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Clip Mute</button><button onClick={() => updateClip(clip.id, { color: colors[(colors.indexOf(clip.color ?? track.color) + 1) % colors.length] }, "Change clip color")} className="bg-[#111] py-1 text-white/55">Color</button></div><label className="mt-2 block uppercase text-white/40">Clip Gain {clip.gain} dB<input type="range" min="-24" max="24" value={clip.gain} onChange={(event) => updateClip(clip.id, { gain: Number(event.target.value) }, "Set clip gain")} className="w-full accent-yellow-300" /></label><label className="mt-2 block uppercase text-white/40">Fade In {clip.fadeIn}<input type="range" min="0" max={visibleDuration(clip)} step="0.01" value={clip.fadeIn} onChange={(event) => updateClip(clip.id, { fadeIn: Number(event.target.value) }, "Set fade in")} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Fade Out {clip.fadeOut}<input type="range" min="0" max={visibleDuration(clip)} step="0.01" value={clip.fadeOut} onChange={(event) => updateClip(clip.id, { fadeOut: Number(event.target.value) }, "Set fade out")} className="w-full accent-pink-300" /></label><label className="mt-2 block uppercase text-white/40">Move to track<select value={track.id} onChange={(event) => moveClipToTrack(event.target.value)} className="mt-1 w-full bg-black p-1 text-green-300">{tracks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}</div>;
}

function RegionPanel({ tracks, selectedClipId, setSelectedTrackId, setSelectedClipId, editLog }: { tracks: Track[]; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; editLog: string[] }) {
  const regions = tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip })));
  return <aside className="grid min-h-0 grid-rows-[42px_1fr_180px] border-l border-black bg-[#20242b]"><div className="border-b border-black bg-[#30343b] px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/55">Regions</div><div className="overflow-auto">{regions.map(({ track, clip }) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("w-full border-b border-black px-3 py-2 text-left", selectedClipId === clip.id ? "bg-[#3a3d45]" : "bg-[#252930]")}><b className="block truncate text-[11px] uppercase" style={{ color: clip.color ?? track.color }}>{clip.name}</b><span className="text-[10px] text-white/40">{track.name} · {clip.missing ? "missing" : formatTime(clip.start)} · {visibleDuration(clip).toFixed(2)}s</span></button>)}</div><div className="overflow-auto border-t border-black p-2 text-[10px] text-white/45"><b className="mb-2 block uppercase text-white/70">Edit history</b>{editLog.map((item) => <div key={item} className="border-b border-white/5 py-1">{item}</div>)}</div></aside>;
}

function MixerWorkspace({ tracks, selected, update, arm }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>, label?: string) => void; arm: (id: string) => void }) {
  if (!tracks.length) return <div className="grid h-full place-items-center bg-[#20242b] text-white/55">Import or record audio in Edit first.</div>;
  return <div className="h-full overflow-auto bg-[#20242b]"><div className="flex min-h-full min-w-max items-stretch border-l border-black">{tracks.map((track, index) => <div key={track.id} className="grid w-[124px] grid-rows-[40px_88px_78px_1fr_58px] border-r border-black bg-[#2d3138] text-center"><div className="flex items-center justify-center border-b border-black bg-[#3a3f47] text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>Ch {index + 1}</div><div className="border-b border-black p-2"><b className="block truncate text-[11px] uppercase text-white/80">{track.name}</b><span className="mt-1 block truncate text-[9px] text-white/35">{track.clips.length} clips</span><button onClick={() => arm(track.id)} className={cn("mt-2 w-full py-1 text-[9px] font-black uppercase", track.armed ? "bg-red-500 text-black" : "bg-[#15171b] text-white/45")}>Rec</button></div><div className="grid grid-cols-2 gap-px border-b border-black p-2 text-[9px] font-black uppercase"><button onClick={() => update(track.id, { muted: !track.muted }, "Toggle mute")} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>Mute</button><button onClick={() => update(track.id, { solo: !track.solo }, "Toggle solo")} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>Solo</button><label className="col-span-2 mt-2 text-white/40">Pan<input type="range" min="-50" max="50" value={track.pan} onChange={(event) => update(track.id, { pan: Number(event.target.value) }, "Set pan")} className="w-full accent-cyan-300" /></label></div><div className="grid grid-cols-[22px_1fr] gap-2 border-b border-black p-3"><div className="relative bg-black"><span className={cn("absolute bottom-0 left-0 right-0", track.volume + track.inputGain >= 154 ? "bg-red-500" : "bg-green-400")} style={{ height: `${Math.min(100, track.volume + track.inputGain / 4)}%` }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) }, "Set fader")} className="h-full w-12 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div><div className="flex items-center justify-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{track.volume.toString().padStart(2, "0")}</div></div>)}</div><div className="fixed bottom-0 left-0 right-0 hidden h-10 border-t border-black bg-[#15171b] px-4 text-xs text-white/45 md:flex md:items-center">Mixer: console strips, faders, meters, pan, mute, solo, record-arm. Selected: {selected?.name ?? "none"}</div></div>;
}

function ExportWorkspace({ tracks, selected, downloadClip, exportArchive }: { tracks: Track[]; selected: Track | null; downloadClip: (track: Track, clip: Clip) => void; exportArchive: () => void }) {
  return <div className="grid h-full place-items-center bg-[#20242b] p-6"><div className="text-center"><h2 className="text-3xl font-black uppercase tracking-widest text-cyan-100">Export</h2><p className="mt-3 text-sm text-white/55">Downloads real source audio and session archives.</p><button disabled={!selected?.clips[0] || selected.clips[0].missing} onClick={() => selected?.clips[0] && downloadClip(selected, selected.clips[0])} className="mt-5 bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download Selected Clip</button><button disabled={!tracks.length} onClick={() => tracks.forEach((track) => track.clips.filter((clip) => !clip.missing).forEach((clip) => downloadClip(track, clip)))} className="ml-3 mt-5 border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download All Audio</button><button onClick={exportArchive} className="ml-3 mt-5 border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70">Export Session Archive</button></div></div>;
}

function FilesWorkspace({ recent, openSession, snapshots, revertSnapshot, snapshot, sessionId, title, bpm, sampleRate, missingClips, offline, lockWarning }: { recent: { id: string; title: string; updatedAt: string }[]; openSession: (id: string) => void; snapshots: Snapshot[]; revertSnapshot: (id: string) => void; snapshot: () => void; sessionId: string; title: string; bpm: number; sampleRate: number; missingClips: Clip[]; offline: boolean; lockWarning: string | null }) {
  return <div className="grid h-full grid-cols-3 bg-[#20242b] text-sm"><section className="border-r border-black p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Recent Sessions</h2>{recent.length === 0 && <p className="mt-4 text-white/45">No saved sessions in this browser yet.</p>}{recent.map((item) => <button key={item.id} onClick={() => openSession(item.id)} className="mt-2 block w-full border border-black bg-[#30343b] p-3 text-left"><b className="block uppercase text-white/80">{item.title}</b><span className="text-xs text-white/40">{new Date(item.updatedAt).toLocaleString()}</span></button>)}</section><section className="border-r border-black p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Version History</h2><button onClick={snapshot} className="mt-3 bg-cyan-300 px-4 py-2 text-xs font-black uppercase text-black">Manual Snapshot</button>{snapshots.length === 0 && <p className="mt-4 text-white/45">No snapshots yet.</p>}{snapshots.map((item) => <div key={item.id} className="mt-2 border border-black bg-[#30343b] p-3"><b className="block uppercase text-white/80">{item.label}</b><span className="text-xs text-white/40">{new Date(item.createdAt).toLocaleString()}</span><button onClick={() => revertSnapshot(item.id)} className="mt-2 block bg-[#111] px-3 py-1 text-xs font-black uppercase text-white/70">Revert</button></div>)}</section><section className="p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Session Status</h2><div className="mt-3 space-y-2 text-white/60"><p><b>ID:</b> {sessionId}</p><p><b>Title:</b> {title}</p><p><b>BPM:</b> {bpm}</p><p><b>Sample rate:</b> {sampleRate}</p><p><b>Connection:</b> {offline ? "Offline" : "Online"}</p><p><b>Lock:</b> {lockWarning ?? "Current tab owns edit lock"}</p><p><b>Missing files:</b> {missingClips.length}</p><p><b>Cloud storage:</b> Supabase upload/database is not wired in this component yet. Current save is local browser metadata plus relinkable source audio.</p></div>{missingClips.length > 0 && <div className="mt-4 border border-red-400/40 bg-red-950 p-3 text-red-100"><b className="block uppercase">Relink needed</b>{missingClips.map((clip) => <p key={clip.id} className="mt-1 text-xs">{clip.name}</p>)}</div>}</section></div>;
}
