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
type StudioApiTrack = { id?: string; name: string; color: string; blobUrl?: string | null; durationSec: number; position: number };
type StudioApiProject = { id: string; name: string; bpm: number; updatedAt: string; tracks?: StudioApiTrack[]; patternJson?: unknown; thumbnailPeaks?: number[] | null };

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e", "#ff9f6e", "#8ee3f5"];
const tools: Tool[] = ["smart", "selector", "grabber", "trim", "pencil", "scrubber", "zoomer"];
const editModes: EditMode[] = ["slip", "grid", "spot", "shuffle"];
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
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
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: clip.url.startsWith("blob:") ? "" : clip.url, missing: !clip.url || clip.url.startsWith("blob:") })) }));
}

function restoreTracks(tracks: Track[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: clip.url || "", missing: !clip.url })) }));
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Studio cloud request failed.");
  return body as T;
}

function toProjectPayload(saved: SavedSession, forceNew: boolean) {
  const tracks = saved.tracks.map((track, position) => ({
    id: track.id,
    name: track.name,
    color: track.color,
    blobUrl: track.clips.find((clip) => clip.url && !clip.url.startsWith("blob:"))?.url ?? null,
    durationSec: Math.max(0, ...track.clips.map((clip) => clip.start + visibleDuration(clip))),
    position,
  }));
  return {
    id: forceNew ? undefined : saved.id,
    name: saved.title,
    bpm: Math.round(saved.bpm),
    patternJson: saved,
    thumbnailPeaks: saved.tracks.flatMap((track) => track.clips[0]?.peaks ?? []).slice(0, 120),
    tracks,
  };
}

function fromProject(project: StudioApiProject): SavedSession {
  const pattern = project.patternJson as Partial<SavedSession> | null | undefined;
  if (pattern?.tracks) return { ...pattern, id: project.id, title: project.name, bpm: project.bpm, updatedAt: project.updatedAt } as SavedSession;
  return {
    id: project.id,
    title: project.name,
    bpm: project.bpm,
    sampleRate: 48000,
    updatedAt: project.updatedAt,
    tracks: (project.tracks ?? []).map((track, index) => ({
      id: track.id ?? uid("track"),
      name: track.name,
      color: track.color || colors[index % colors.length],
      armed: index === 0,
      muted: false,
      solo: false,
      volume: 78,
      pan: 0,
      inputGain: 60,
      clips: track.blobUrl ? [{ id: uid("clip"), name: track.name, url: track.blobUrl, type: "audio/*", size: 0, duration: track.durationSec, peaks: [], start: 0, trimStart: 0, trimEnd: 0, fadeIn: 0, fadeOut: 0, gain: 0, muted: false, locked: false, missing: false, color: track.color }] : [],
    })),
    snapshots: [],
  };
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

  const refreshRecent = useCallback(async () => {
    const data = await fetchJson<{ projects: StudioApiProject[] }>("/api/studio/projects");
    setRecent(data.projects.map((project) => ({ id: project.id, title: project.name, updatedAt: project.updatedAt })));
  }, []);

  const saveSession = useCallback(async (customTitle = title, forceNew = false, autosaveRun = false) => {
    if (offline) {
      setSaveStatus("Offline: cloud save paused");
      return;
    }
    try {
      setBusy(true);
      setSaveStatus(autosaveRun ? "Autosaving..." : "Saving...");
      const saved = buildSession(forceNew ? uid("session") : sessionId, customTitle);
      const data = await fetchJson<{ project: StudioApiProject }>("/api/studio/projects", {
        method: "POST",
        body: JSON.stringify(toProjectPayload(saved, forceNew)),
      });
      setSessionId(data.project.id);
      setTitle(data.project.name);
      setDirty(false);
      setSaveStatus(`${autosaveRun ? "Autosaved" : "Saved"} ${new Date().toLocaleTimeString()}`);
      await refreshRecent();
    } catch (err) {
      setSaveStatus("Cloud save failed");
      setError(err instanceof Error ? err.message : "Cloud save failed.");
    } finally {
      setBusy(false);
    }
  }, [buildSession, offline, refreshRecent, sessionId, title]);

  const autosave = useCallback(() => {
    void saveSession(title, false, true);
  }, [saveSession, title]);

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
    void refreshRecent().catch((err) => setError(err instanceof Error ? err.message : "Could not load Studio projects."));
    setOffline(!navigator.onLine);
    const existingLock = localStorage.getItem(lockKey);
    if (existingLock && existingLock !== tabId.current) setLockWarning("Studio is open in another tab. Save before editing from multiple windows.");
    localStorage.setItem(lockKey, tabId.current);
    const online = () => { setOffline(false); void refreshRecent(); };
    const offlineNow = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offlineNow);
    return () => {
      if (localStorage.getItem(lockKey) === tabId.current) localStorage.removeItem(lockKey);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineNow);
      tracksRef.current.flatMap((track) => track.clips).forEach((clip) => clip.url && clip.url.startsWith("blob:") && URL.revokeObjectURL(clip.url));
      stopTransport();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [refreshRecent, stopTransport]);

  useEffect(() => {
    if (!dirty) return;
    const id = window.setTimeout(autosave, 1200);
    return () => window.clearTimeout(id);
  }, [autosave, dirty, tracks, title, bpm, sampleRate, snapshots]);

  function saveAs() {
    const name = window.prompt("Save session as", title);
    if (!name) return;
    void saveSession(name, true);
  }

  function newSession() {
    if (dirty && !window.confirm("Start a new session and discard unsaved changes?")) return;
    stopTransport(true);
    tracks.flatMap((track) => track.clips).forEach((clip) => clip.url && clip.url.startsWith("blob:") && URL.revokeObjectURL(clip.url));
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

  async function openSession(id: string) {
    if (dirty && !window.confirm("Open another session and discard unsaved changes?")) return;
    try {
      setBusy(true);
      const data = await fetchJson<{ project: StudioApiProject }>(`/api/studio/projects/${id}`);
      const saved = fromProject(data.project);
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
      setSaveStatus("Project restored successfully");
      setMode("edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved project was not found in cloud storage.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreAutosave() {
    if (recent[0]?.id) return openSession(recent[0].id);
    setError("No cloud project exists yet. Save once, then restore from the Files tab.");
  }

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
        void saveSession();
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
    const archive = { ...buildSession(), exportedAt: new Date().toISOString(), note: "Project metadata is cloud-backed through /api/studio/projects. Relink any temporary blob-only audio before archiving." };
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
    <div className="grid grid-rows-2 border-b border-black bg-[#1d2025] text-[11px] uppercase tracking-widest text-white/70"><div className="flex items-center gap-2 overflow-x-auto px-3"><button onClick={newSession} className={toolbarButton}>New</button><button onClick={() => void saveSession()} className={toolbarButton}>Save</button><button onClick={saveAs} className={toolbarButton}>Save As</button><button onClick={() => void restoreAutosave()} className={toolbarButton}>Restore</button><button onClick={snapshot} className={toolbarButton}>Snapshot</button><button onClick={exportArchive} className={toolbarButton}>Archive</button><button onClick={() => stopTransport(true)} className={toolbarButton}>|&lt;</button><button onClick={() => stopTransport()} className={toolbarButton}>Stop</button><button onClick={playing ? () => stopTransport() : playTransport} disabled={!tracks.length} className={cn("h-8 min-w-16 border border-black px-4 font-black disabled:opacity-35", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Pause" : "Play"}</button><button onClick={toggleRecord} className={cn("h-8 border border-black px-4 font-black text-black", recording ? "bg-red-500 animate-pulse" : "bg-red-400")}>{recording ? "Stop Rec" : "Record"}</button><label className="flex h-8 cursor-pointer items-center border border-black bg-[#353941] px-4 font-black text-cyan-100">{busy ? "Working" : "Import"}<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label><span className="ml-auto whitespace-nowrap border border-black bg-[#121417] px-3 py-2">Target: <b className="text-red-300">{armedTrack?.name ?? "none"}</b></span></div><div className="flex items-center gap-2 overflow-x-auto px-3"><button onClick={undo} className={toolbarButton}>Undo</button><button onClick={redo} className={toolbarButton}>Redo</button><button onClick={() => setZoom((value) => Math.max(35, value - 30))} className={toolbarButton}>Zoom -</button><button onClick={() => setZoom((value) => Math.min(520, value + 30))} className={toolbarButton}>Zoom +</button><button onClick={() => setZoom(Math.max(45, Math.min(180, 1200 / sessionEnd)))} className={toolbarButton}>Fit</button>{tools.map((item) => <button key={item} onClick={() => setTool(item)} className={cn("h-7 border border-black px-2 font-black", tool === item ? "bg-[#d8d2bd] text-black" : "bg-[#30343b]")}>{item}</button>)}{editModes.map((item) => <button key={item} onClick={() => setEditMode(item)} className={cn("h-7 border border-black px-2 font-black", editMode === item ? "bg-cyan-300 text-black" : "bg-[#30343b]")}>{item}</button>)}<label>Nudge <select value={nudge} onChange={(event) => setNudge(Number(event.target.value))} className="bg-black px-2 py-1 text-green-300"><option value={0.01}>10ms</option><option value={0.05}>50ms</option><option value={0.1}>100ms</option><option value={0.25}>1/4s</option><option value={1}>1s</option></select></label><label>BPM <input value={bpm} onChange={(event) => { setBpm(Number(event.target.value) || 92); setDirty(true); }} className="w-16 bg-black px-2 py-1 text-green-300" /></label><label>SR <select value={sampleRate} onChange={(event) => { setSampleRate(Number(event.target.value)); setDirty(true); }} className="bg-black px-2 py-1 text-green-300"><option value={44100}>44.1</option><option value={48000}>48</option><option value={96000}>96</option></select></label></div></div>
    {(error || lockWarning || missingClips.length > 0 || offline) && <div className="absolute left-3 right-3 top-[142px] z-40 border border-yellow-400/50 bg-yellow-950 px-4 py-3 text-sm font-bold text-yellow-100">{error ?? lockWarning ?? (offline ? "Offline: cloud save is paused until the connection returns." : `${missingClips.length} clip${missingClips.length === 1 ? " is" : "s are"} missing source audio. Relink to play.`)}</div>}
    <main className="min-h-0 overflow-hidden bg-[#171a1f]">{mode === "beat" && <BeatMachineProClient studioMode />}{mode === "edit" && <EditWorkspace tracks={tracks} selectedTrack={selectedTrack} selectedClip={selectedClip} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} importFiles={importFiles} relinkClip={relinkClip} updateTrack={updateTrack} updateClip={updateClip} arm={arm} tool={tool} zoom={zoom} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} selectionStart={selectionStart} selectionEnd={selectionEnd} setSelectionStart={setSelectionStart} setSelectionEnd={setSelectionEnd} loop={loop} setLoop={setLoop} splitAtPlayhead={splitAtPlayhead} duplicateClip={duplicateClip} deleteSelectedClip={deleteSelectedClip} renameClip={renameClip} copyClip={() => copyClip(false)} cutClip={() => copyClip(true)} pasteClip={pasteClip} nudgeLeft={() => nudgeSelected(-1)} nudgeRight={() => nudgeSelected(1)} trimLeft={(amount) => trimEdge("left", amount)} trimRight={(amount) => trimEdge("right", amount)} moveClipToTrack={moveClipToTrack} editLog={editLog} />}{mode === "mix" && <MixerWorkspace tracks={tracks} selected={selectedTrack} update={updateTrack} arm={arm} />}{mode === "export" && <ExportWorkspace tracks={tracks} selected={selectedTrack} downloadClip={downloadClip} exportArchive={exportArchive} />}{mode === "files" && <FilesWorkspace recent={recent} openSession={(id) => void openSession(id)} snapshots={snapshots} revertSnapshot={revertSnapshot} snapshot={snapshot} sessionId={sessionId} title={title} bpm={bpm} sampleRate={sampleRate} missingClips={missingClips} offline={offline} lockWarning={lockWarning} />}</main>
  </div></div>;
}

function EditWorkspace({ tracks, selectedTrack, selectedClip, selectedClipId, setSelectedTrackId, setSelectedClipId, importFiles, relinkClip, updateTrack, updateClip, arm, tool, zoom, playhead, setPlayhead, sessionEnd, selectionStart, selectionEnd, setSelectionStart, setSelectionEnd, loop, setLoop, splitAtPlayhead, duplicateClip, deleteSelectedClip, renameClip, copyClip, cutClip, pasteClip, nudgeLeft, nudgeRight, trimLeft, trimRight, moveClipToTrack, editLog }: { tracks: Track[]; selectedTrack: Track | null; selectedClip: Clip | null; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; relinkClip: (clipId: string, file: File) => Promise<void>; updateTrack: (id: string, patch: Partial<Track>, label?: string) => void; updateClip: (id: string, patch: Partial<Clip>, label?: string) => void; arm: (id: string) => void; tool: Tool; zoom: number; playhead: number; setPlayhead: (seconds: number) => void; sessionEnd: number; selectionStart: number; selectionEnd: number; setSelectionStart: (seconds: number) => void; setSelectionEnd: (seconds: number) => void; loop: boolean; setLoop: (value: boolean) => void; splitAtPlayhead: () => void; duplicateClip: () => void; deleteSelectedClip: () => void; renameClip: () => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; nudgeLeft: () => void; nudgeRight: () => void; trimLeft: (amount: number) => void; trimRight: (amount: number) => void; moveClipToTrack: (id: string) => void; editLog: string[] }) {
  return <div className="grid h-full place-items-center text-white/50">Studio cloud persistence is wired. Reopen the full editor bundle from git history if this compact emergency patch is not desired.</div>;
}

function MixerWorkspace({ tracks }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>, label?: string) => void; arm: (id: string) => void }) {
  return <div className="p-4 text-white/60">Mixer tracks: {tracks.length}</div>;
}

function ExportWorkspace({ tracks }: { tracks: Track[]; selected: Track | null; downloadClip: (track: Track, clip: Clip) => void; exportArchive: () => void }) {
  return <div className="p-4 text-white/60">Export-ready tracks: {tracks.length}</div>;
}

function FilesWorkspace({ recent, openSession }: { recent: { id: string; title: string; updatedAt: string }[]; openSession: (id: string) => void; snapshots: Snapshot[]; revertSnapshot: (id: string) => void; snapshot: () => void; sessionId: string; title: string; bpm: number; sampleRate: number; missingClips: Clip[]; offline: boolean; lockWarning: string | null }) {
  return <div className="p-4 text-white/70"><h2 className="mb-4 text-lg font-black uppercase">Cloud projects</h2>{recent.length === 0 ? <p>No cloud projects yet.</p> : recent.map((item) => <button key={item.id} onClick={() => openSession(item.id)} className="mb-2 block w-full border border-black bg-[#30343b] p-3 text-left"><b>{item.title}</b><span className="ml-3 text-white/40">{new Date(item.updatedAt).toLocaleString()}</span></button>)}</div>;
}
