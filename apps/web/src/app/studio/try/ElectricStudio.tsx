"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import type {
  StudioClip,
  StudioEditMode,
  StudioExperienceMode,
  StudioHistoryEntry,
  StudioMode,
  StudioSavedSession,
  StudioSnapshot,
  StudioTask,
  StudioTemplateId,
  StudioTool,
  StudioTrack,
} from "./studio/types";
import {
  buildPersistableTracks,
  fetchProductionStudioSession,
  fetchRecentStudioProjects,
  restorePersistedTracks,
  studioFetchJson,
  studioProjectToSession,
  toStudioProjectPayload,
} from "./studio/api";
import { clipFileExtension, decodeStudioAudio, isTemporaryObjectUrl } from "./studio/audio";
import { calculateSessionEnd, snapToGrid, visibleClipDuration } from "./studio/timeline";
import { EditWorkspace } from "./studio/components/EditWorkspace";
import { ExportWorkspace } from "./studio/components/ExportWorkspace";
import { FilesWorkspace } from "./studio/components/FilesWorkspace";
import { MixerWorkspace } from "./studio/components/MixerWorkspace";
import { StudioChrome } from "./studio/components/StudioChrome";
import { FirstSessionGuide } from "./studio/components/FirstSessionGuide";
import { RecordingPreflight } from "./studio/components/RecordingPreflight";
import { RecoveryComparison } from "./studio/components/RecoveryComparison";
import { getStudioAlert } from "./studio/presentation";
import { createTemplateSession, getFirstSessionStep, hydrateWorkspaceState } from "./studio/workspace";
import {
  compareRecoveryVersions,
  createRecoveryEnvelope,
  getSaveStatusText,
  loadLocalRecovery,
  saveLocalRecovery,
  type StudioRecoveryEnvelope,
  type StudioSaveState,
} from "./studio/recovery";

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e", "#8ee3f5"];
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const lockKey = "ems.studio.lock.v2";

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cleanName(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ").trim() || "Audio Track";
}

function slug(value: string) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}

function cloneTracks(tracks: StudioTrack[]) {
  return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) }));
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<StudioMode>("edit");
  const [experience, setExperience] = useState<StudioExperienceMode>("engineer");
  const [task, setTask] = useState<StudioTask>("arrange");
  const [templateId, setTemplateId] = useState<StudioTemplateId>("empty");
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preflightComplete, setPreflightComplete] = useState(false);
  const [saveState, setSaveState] = useState<StudioSaveState>("local-draft");
  const [savedAt, setSavedAt] = useState<string>();
  const [recoveryChoice, setRecoveryChoice] = useState<{ local: StudioSavedSession; cloud: StudioSavedSession } | null>(null);
  const [tool, setTool] = useState<StudioTool>("smart");
  const [editMode, setEditMode] = useState<StudioEditMode>("grid");
  const [tracks, setTracks] = useState<StudioTrack[]>([]);
  const tracksRef = useRef<StudioTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState(() => uid("session"));
  const [projectUpdatedAt, setProjectUpdatedAt] = useState(() => new Date().toISOString());
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
  const [snapshots, setSnapshots] = useState<StudioSnapshot[]>([]);
  const [history, setHistory] = useState<StudioHistoryEntry[]>([]);
  const [redoHistory, setRedoHistory] = useState<StudioHistoryEntry[]>([]);
  const [editLog, setEditLog] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<StudioClip | null>(null);
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
  const sessionEnd = calculateSessionEnd(tracks);
  const missingClips = tracks.flatMap((track) => track.clips.filter((clip) => clip.missing || !clip.url));

  const markDirty = useCallback((label: string) => {
    setDirty(true);
    setSaveStatus("Unsaved changes");
    setEditLog((current) => [`${new Date().toLocaleTimeString()}  ${label}`, ...current].slice(0, 60));
  }, []);

  const commit = useCallback((label: string, recipe: (draft: StudioTrack[]) => StudioTrack[]) => {
    setTracks((current) => {
      setHistory((items) => [{ label, tracks: cloneTracks(current) }, ...items].slice(0, 80));
      setRedoHistory([]);
      return recipe(cloneTracks(current));
    });
    markDirty(label);
  }, [markDirty]);

  const buildSession = useCallback((id = sessionId, sessionTitle = title): StudioSavedSession => ({
    id,
    title: sessionTitle,
    bpm,
    sampleRate,
    updatedAt: new Date().toISOString(),
    tracks: buildPersistableTracks(tracks),
    snapshots: snapshots.map((snapshot) => ({ ...snapshot, tracks: buildPersistableTracks(snapshot.tracks) })),
    schemaVersion: 3,
    experienceMode: experience,
    task,
    templateId,
  }), [bpm, experience, sampleRate, sessionId, snapshots, task, templateId, title, tracks]);

  const refreshRecent = useCallback(async () => {
    setRecent(await fetchRecentStudioProjects());
  }, []);

  const saveSession = useCallback(async (customTitle = title, forceNew = false, _autosaveRun = false) => {
    const saved = buildSession(forceNew ? uid("session") : sessionId, customTitle);
    const envelope = createRecoveryEnvelope(saved);
    saveLocalRecovery(saved.id, envelope);
    if (offline) {
      setSaveState("offline-local");
      setSaveStatus(getSaveStatusText("offline-local"));
      return;
    }
    try {
      setBusy(true);
      setSaveState("saving-cloud");
      setSaveStatus(getSaveStatusText("saving-cloud"));
      const data = await studioFetchJson<{ project: { id: string; name: string } }>("/api/studio/projects", {
        method: "POST",
        body: JSON.stringify(toStudioProjectPayload(saved, forceNew)),
      });
      setSessionId(data.project.id);
      setTitle(data.project.name);
      setProjectUpdatedAt(envelope.updatedAt);
      setDirty(false);
      const timestamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setSavedAt(timestamp);
      setSaveState("cloud-saved");
      setSaveStatus(getSaveStatusText("cloud-saved", timestamp));
      localStorage.removeItem(`ems.studio.recovery.v3:${saved.id}`);
      await refreshRecent();
    } catch (err) {
      setSaveState("save-failed");
      setSaveStatus(getSaveStatusText("save-failed"));
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
    const savedExperience = localStorage.getItem("ems.studio.experience.v1");
    if (savedExperience === "creator" || savedExperience === "engineer") setExperience(savedExperience);
    setGuideDismissed(localStorage.getItem("ems.studio.first-session.v1") === "dismissed");
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
      tracksRef.current.flatMap((track) => track.clips).forEach((clip) => clip.url && isTemporaryObjectUrl(clip.url) && URL.revokeObjectURL(clip.url));
      stopTransport();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [refreshRecent, stopTransport]);

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

  function saveAs() {
    const name = window.prompt("Save session as", title);
    if (!name) return;
    void saveSession(name, true);
  }

  function newSession() {
    if (dirty && !window.confirm("Start a new session and discard unsaved changes?")) return;
    stopTransport(true);
    tracks.flatMap((track) => track.clips).forEach((clip) => clip.url && isTemporaryObjectUrl(clip.url) && URL.revokeObjectURL(clip.url));
    setTracks([]);
    setSelectedTrackId(null);
    setSelectedClipId(null);
    setSessionId(uid("session"));
    setProjectUpdatedAt(new Date().toISOString());
    setTitle("Untitled Session");
    setBpm(92);
    setSampleRate(48000);
    setSnapshots([]);
    setHistory([]);
    setRedoHistory([]);
    setDirty(false);
    setSaveStatus("New session");
    setTask("create");
    setTemplateId("empty");
    setPreflightComplete(false);
  }

  function applySavedSession(saved: StudioSavedSession, localDraft = false) {
      stopTransport(true);
      setSessionId(saved.id);
      setProjectUpdatedAt(saved.updatedAt);
      setTitle(saved.title);
      setBpm(saved.bpm);
      setSampleRate(saved.sampleRate);
      setTracks(restorePersistedTracks(saved.tracks));
      setSnapshots(saved.snapshots.map((snapshot) => ({ ...snapshot, tracks: restorePersistedTracks(snapshot.tracks) })));
      const workspace = hydrateWorkspaceState(saved);
      setExperience(workspace.experienceMode);
      setTask(workspace.task);
      setTemplateId(workspace.templateId);
      setSelectedTrackId(saved.tracks[0]?.id ?? null);
      setSelectedClipId(saved.tracks[0]?.clips[0]?.id ?? null);
      setDirty(localDraft);
      setSaveState(localDraft ? "local-draft" : "cloud-saved");
      setSaveStatus(localDraft ? getSaveStatusText("local-draft") : getSaveStatusText("cloud-saved"));
      setMode("edit");
  }

  async function openSession(id: string) {
    if (dirty && !window.confirm("Open another session and discard unsaved changes?")) return;
    try {
      setBusy(true);
      let saved: StudioSavedSession;
      try {
        saved = await fetchProductionStudioSession(id);
      } catch {
        const data = await studioFetchJson<{ project: Parameters<typeof studioProjectToSession>[0] }>(`/api/studio/projects/${id}`);
        saved = studioProjectToSession(data.project);
      }
      const localEnvelope = loadLocalRecovery<StudioRecoveryEnvelope<StudioSavedSession>>(id);
      if (localEnvelope?.project && compareRecoveryVersions(localEnvelope, { ...localEnvelope, updatedAt: saved.updatedAt }).recommended === "local") {
        setRecoveryChoice({ local: localEnvelope.project, cloud: saved });
        setSaveState("conflict");
        setSaveStatus(getSaveStatusText("conflict"));
        return;
      }
      applySavedSession(saved);
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

  async function ensureCloudProject() {
    if (offline) throw new Error("Offline: cloud audio upload is unavailable.");
    setSaveStatus("Preparing cloud project...");
    const saved = buildSession(sessionId, title);
    const data = await studioFetchJson<{ project: { id: string; name: string } }>("/api/studio/projects", {
      method: "POST",
      body: JSON.stringify(toStudioProjectPayload(saved, false)),
    });
    setSessionId(data.project.id);
    setTitle(data.project.name);
    await refreshRecent();
    return data.project.id;
  }

  async function uploadStudioAudio(blob: Blob, fileName: string, type: string, decoded: Awaited<ReturnType<typeof decodeStudioAudio>>, targetTrackId?: string, start = 0, color = colors[tracks.length % colors.length]) {
    const projectId = await ensureCloudProject();
    const file = blob instanceof File ? blob : new File([blob], fileName, { type: type || blob.type || "audio/webm" });
    const form = new FormData();
    form.append("file", file, fileName);
    form.append("durationSec", String(decoded.duration));
    form.append("createClip", "true");
    form.append("startSec", String(start));
    form.append("color", color);
    form.append("peaksJson", JSON.stringify(decoded.peaks));
    if (targetTrackId) form.append("trackId", targetTrackId);

    const res = await fetch(`/api/studio/projects/${projectId}/audio/upload`, { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.url !== "string" || !body.url) {
      throw new Error(typeof body.error === "string" ? body.error : "Cloud audio upload failed.");
    }
    return { projectId, url: body.url as string, clipId: typeof body.clip?.id === "string" ? body.clip.id as string : uid("clip") };
  }

  async function createClipFromBlob(blob: Blob, fileName: string, type: string, targetTrackId?: string, start = 0) {
    const decoded = await decodeStudioAudio(blob);
    const color = colors[tracks.length % colors.length];
    setSampleRate(decoded.sampleRate);
    setSaveStatus("Uploading audio to cloud...");
    const uploaded = await uploadStudioAudio(blob, fileName, type, decoded, targetTrackId, start, color);
    const clip: StudioClip = {
      id: uploaded.clipId,
      name: fileName,
      url: uploaded.url,
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
      missing: false,
    };
    if (targetTrackId) {
      commit("Cloud audio clip added", (draft) => draft.map((track) => track.id === targetTrackId ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
      setSelectedTrackId(targetTrackId);
      setSelectedClipId(clip.id);
      await saveSession(title, false, true);
      return;
    }
    const track: StudioTrack = {
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
    commit("Cloud audio track imported", (draft) => [...draft, track]);
    setSelectedTrackId(track.id);
    setSelectedClipId(clip.id);
    await saveSession(title, false, true);
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) return setError("Use a real audio file: WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.");
    setBusy(true);
    setError(null);
    try {
      for (const file of audioFiles) await createClipFromBlob(file, file.name, file.type || "audio/*");
      setSaveStatus("Imported audio saved to cloud");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio could not be decoded or uploaded. Try WAV or MP3.");
      setSaveStatus("Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function relinkClip(clipId: string, file: File) {
    setBusy(true);
    try {
      const decoded = await decodeStudioAudio(file);
      const currentClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId);
      const currentTrack = tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
      const uploaded = await uploadStudioAudio(file, file.name, file.type || "audio/*", decoded, currentTrack?.id, currentClip?.start ?? 0, currentClip?.color ?? "#65d6ff");
      commit("Relink cloud audio", (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, name: file.name, url: uploaded.url, type: file.type || "audio/*", size: file.size, duration: decoded.duration, peaks: decoded.peaks, missing: false } : clip) })));
      setSampleRate(decoded.sampleRate);
      await saveSession(title, false, true);
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
        setBusy(true);
        try {
          await createClipFromBlob(blob, `Take ${new Date().toLocaleTimeString()}.webm`, rec.mimeType || "audio/webm", target, playhead);
          setSaveStatus("Recording saved to cloud");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Recording could not be uploaded.");
          setSaveStatus("Recording upload failed");
        } finally {
          setBusy(false);
        }
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      markDirty("Start recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone recording failed.");
    }
  }

  function requestRecord() {
    if (recording || preflightComplete) {
      void toggleRecord();
      return;
    }
    setPreflightOpen(true);
  }

  function changeTask(value: StudioTask) {
    setTask(value);
    setMode(value === "mix" ? "mix" : value === "finish" ? "export" : "edit");
  }

  function changeExperience(value: StudioExperienceMode) {
    setExperience(value);
    localStorage.setItem("ems.studio.experience.v1", value);
    if (value === "creator") changeTask(task);
  }

  function applyTemplate(value: StudioTemplateId) {
    const template = createTemplateSession(value);
    setTemplateId(value);
    setBpm(template.bpm);
    setSampleRate(template.sampleRate);
    setTracks(template.tracks);
    setSelectedTrackId(template.tracks[0]?.id ?? null);
    setSelectedClipId(null);
    const nextTask: StudioTask = value === "mastering" ? "finish" : value === "stems" ? "mix" : "create";
    changeTask(nextTask);
    markDirty(`Started ${value} template`);
  }

  function playTransport() {
    if (playing) return;
    const soloed = tracks.filter((track) => track.solo);
    const sourceTracks = soloed.length ? soloed : tracks;
    const clips = sourceTracks.flatMap((track) => track.muted ? [] : track.clips.filter((clip) => !clip.muted && !clip.missing && clip.url && playhead < clip.start + visibleClipDuration(clip)).map((clip) => ({ track, clip })));
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

  function updateTrack(id: string, patch: Partial<StudioTrack>, label = "Update track") {
    commit(label, (draft) => draft.map((track) => track.id === id ? { ...track, ...patch, clips: patch.clips ?? track.clips } : track));
  }

  function updateClip(id: string, patch: Partial<StudioClip>, label = "Update clip") {
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
    return snapToGrid(value, grid, editMode === "grid");
  }

  function nudgeSelected(direction: -1 | 1) {
    if (!selectedClipRef || selectedClipRef.clip.locked) return;
    updateClip(selectedClipRef.clip.id, { start: snap(selectedClipRef.clip.start + direction * nudge) }, direction < 0 ? "Nudge left" : "Nudge right");
  }

  function splitAtPlayhead() {
    if (!selectedClipRef || selectedClipRef.clip.locked) return;
    const { track, clip } = selectedClipRef;
    const local = playhead - clip.start;
    if (local <= 0.02 || local >= visibleClipDuration(clip) - 0.02) return;
    const left: StudioClip = { ...clip, id: uid("clip"), name: `${clip.name} A`, trimEnd: clip.trimEnd + visibleClipDuration(clip) - local };
    const right: StudioClip = { ...clip, id: uid("clip"), name: `${clip.name} B`, start: clip.start + local, trimStart: clip.trimStart + local };
    commit("Separate clip", (draft) => draft.map((item) => item.id === track.id ? { ...item, clips: item.clips.flatMap((candidate) => candidate.id === clip.id ? [left, right] : [candidate]) } : item));
    setSelectedClipId(right.id);
  }

  function duplicateClip() {
    if (!selectedClipRef) return;
    const copy: StudioClip = { ...selectedClipRef.clip, id: uid("clip"), name: `${selectedClipRef.clip.name} copy`, start: snap(selectedClipRef.clip.start + visibleClipDuration(selectedClipRef.clip) + nudge), locked: false };
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
    const pasted: StudioClip = { ...clipboard, id: uid("clip"), name: `${clipboard.name} paste`, start: snap(playhead), locked: false };
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
    const archive = { ...buildSession(), exportedAt: new Date().toISOString(), note: "Project metadata and imported audio are cloud-backed. Use project restore to reload durable audio sources." };
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}-session-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus("Archive exported");
  }

  function downloadClip(track: StudioTrack, clip: StudioClip) {
    if (!clip.url) return setError("That clip is missing its source audio. Relink it first.");
    const a = document.createElement("a");
    a.href = clip.url;
    a.download = `${slug(track.name)}-${slug(clip.name)}.${clipFileExtension(clip)}`;
    a.click();
  }

  const alert = getStudioAlert(error, lockWarning, offline, missingClips.length);
  const guideStep = getFirstSessionStep({ trackCount: tracks.length, editCount: editLog.length, cloudSaved: !dirty && saveStatus.toLowerCase().includes("saved"), finished: mode === "export" && tracks.length > 0 });

  return <div className="studio-app"><div className="studio-app__frame">
    <StudioChrome mode={mode} setMode={setMode} experience={experience} setExperience={changeExperience} task={task} setTask={changeTask} title={title} setTitle={(value) => { setTitle(value); setDirty(true); setSaveState("local-draft"); setSaveStatus(getSaveStatusText("local-draft")); }} saveStatus={saveStatus} saveState={saveState} savedAt={savedAt} missingMedia={missingClips.length} dirty={dirty} busy={busy} playing={playing} recording={recording} tracksLength={tracks.length} playhead={playhead} onNew={newSession} onSave={() => void saveSession()} onSaveAs={saveAs} onRestore={() => void restoreAutosave()} onSnapshot={snapshot} onArchive={exportArchive} onStop={stopTransport} onPlay={playing ? () => stopTransport() : playTransport} onRecord={requestRecord} onImport={(files) => void importFiles(files)} undo={undo} redo={redo} tool={tool} setTool={setTool} editMode={editMode} setEditMode={setEditMode} zoomOut={() => setZoom((value) => Math.max(35, value - 30))} zoomIn={() => setZoom((value) => Math.min(520, value + 30))} fit={() => setZoom(Math.max(45, Math.min(180, 1200 / sessionEnd)))} bpm={bpm} setBpm={(value) => { setBpm(value); setDirty(true); }} sampleRate={sampleRate} setSampleRate={(value) => { setSampleRate(value); setDirty(true); }} nudge={nudge} setNudge={setNudge} grid={grid} setGrid={setGrid} />
    {!guideDismissed && (
      <FirstSessionGuide
        step={guideStep}
        onDismiss={() => {
          setGuideDismissed(true);
          localStorage.setItem("ems.studio.first-session.v1", "dismissed");
        }}
      />
    )}
    {alert && <div className={`studio-alert studio-alert--${alert.tone}`} role="status"><span>!</span><p>{alert.message}</p><button onClick={() => setError(null)} aria-label="Dismiss alert">×</button></div>}
    <main className="studio-workspace">{mode === "beat" && <div className="studio-beat-stage"><BeatMachineProClient studioMode /></div>}{mode === "edit" && <EditWorkspace tracks={tracks} selectedTrack={selectedTrack} selectedClip={selectedClip} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} importFiles={importFiles} relinkClip={relinkClip} updateTrack={updateTrack} updateClip={updateClip} arm={arm} tool={tool} zoom={zoom} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} selectionStart={selectionStart} selectionEnd={selectionEnd} setSelectionStart={setSelectionStart} setSelectionEnd={setSelectionEnd} loop={loop} setLoop={setLoop} splitAtPlayhead={splitAtPlayhead} duplicateClip={duplicateClip} deleteSelectedClip={deleteSelectedClip} renameClip={renameClip} copyClip={() => copyClip(false)} cutClip={() => copyClip(true)} pasteClip={pasteClip} nudgeLeft={() => nudgeSelected(-1)} nudgeRight={() => nudgeSelected(1)} trimLeft={(amount) => trimEdge("left", amount)} trimRight={(amount) => trimEdge("right", amount)} moveClipToTrack={moveClipToTrack} editLog={editLog} onRecord={requestRecord} onBeat={() => setMode("beat")} experience={experience} onTemplate={applyTemplate} />}{mode === "mix" && <MixerWorkspace tracks={tracks} selected={selectedTrack} update={updateTrack} arm={arm} />}{mode === "export" && <ExportWorkspace tracks={tracks} selected={selectedTrack} downloadClip={downloadClip} exportArchive={exportArchive} projectId={sessionId} title={title} updatedAt={projectUpdatedAt} saved={!dirty && saveState === "cloud-saved"} />}{mode === "files" && <FilesWorkspace recent={recent} openSession={(id) => void openSession(id)} snapshots={snapshots} revertSnapshot={revertSnapshot} snapshot={snapshot} sessionId={sessionId} title={title} bpm={bpm} sampleRate={sampleRate} missingClips={missingClips} offline={offline} lockWarning={lockWarning} />}</main>
    {preflightOpen && (
      <RecordingPreflight
        onClose={() => setPreflightOpen(false)}
        onReady={() => {
          setPreflightComplete(true);
          setPreflightOpen(false);
          void toggleRecord();
        }}
      />
    )}
    {recoveryChoice && (
      <RecoveryComparison
        local={recoveryChoice.local}
        cloud={recoveryChoice.cloud}
        onKeepLocal={() => {
          applySavedSession(recoveryChoice.local, true);
          setRecoveryChoice(null);
        }}
        onKeepCloud={() => {
          localStorage.removeItem(`ems.studio.recovery.v3:${recoveryChoice.cloud.id}`);
          applySavedSession(recoveryChoice.cloud);
          setRecoveryChoice(null);
        }}
        onPreserveBoth={() => {
          const copy = { ...recoveryChoice.local, id: uid("session"), title: `${recoveryChoice.local.title} — Recovered Copy`, updatedAt: new Date().toISOString() };
          saveLocalRecovery(copy.id, createRecoveryEnvelope(copy));
          applySavedSession(copy, true);
          setRecoveryChoice(null);
        }}
      />
    )}
  </div></div>;
}
