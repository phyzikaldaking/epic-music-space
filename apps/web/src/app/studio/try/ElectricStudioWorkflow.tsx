"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Mode = "edit" | "mix" | "export" | "files";
type Tool = "smart" | "selector" | "grabber" | "trim" | "zoomer";
type TrackKind = "audio" | "aux" | "master";
type Clip = { id: string; name: string; url: string; type: string; size: number; duration: number; peaks: number[]; start: number; trimStart: number; trimEnd: number; gain: number; muted: boolean; locked: boolean; color: string };
type Track = { id: string; kind: TrackKind; name: string; color: string; armed: boolean; muted: boolean; solo: boolean; volume: number; pan: number; inputGain: number; clips: Clip[] };
type HistoryItem = { label: string; tracks: Track[] };
type RenderProgress = { status: string; percent: number };

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e"];
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const sessionKey = "ems.workflow.session.v3";

function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function cn(...classes: Array<string | false | null | undefined>) { return classes.filter(Boolean).join(" "); }
function cleanName(name: string) { return name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ").trim() || "Audio Track"; }
function slug(name: string) { return cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audio"; }
function visibleDuration(clip: Clip) { return Math.max(0.05, clip.duration - clip.trimStart - clip.trimEnd); }
function formatTime(seconds: number) { const safe = Math.max(0, seconds || 0); const m = Math.floor(safe / 60); const s = Math.floor(safe % 60); const cs = Math.floor((safe % 1) * 100); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`; }
function cloneTracks(tracks: Track[]) { return tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip })) })); }
function makeTrack(kind: TrackKind, index: number, armed = false): Track { const color = kind === "master" ? "#d8d2bd" : colors[index % colors.length]; return { id: uid("track"), kind, name: kind === "audio" ? `Audio ${index + 1}` : kind === "aux" ? `Aux ${index + 1}` : "Master", color, armed: kind === "audio" && armed, muted: false, solo: false, volume: kind === "master" ? 85 : 78, pan: 0, inputGain: 60, clips: [] }; }
function clipExt(clip: Clip) { const ext = clip.name.split(".").pop(); if (ext && ext.length < 6) return ext.toLowerCase(); if (clip.type.includes("wav")) return "wav"; if (clip.type.includes("mpeg")) return "mp3"; if (clip.type.includes("webm")) return "webm"; return "audio"; }

async function decodeAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
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

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const writeString = (value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); offset += value.length; };
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;
  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  for (let i = 0; i < frames; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function renderWavMaster(tracks: Track[], masterVolume: number, sampleRate: number, onProgress: (progress: RenderProgress) => void) {
  const sourceTracks = tracks.some((track) => track.solo)
    ? tracks.filter((track) => track.kind === "audio" && track.solo && !track.muted)
    : tracks.filter((track) => track.kind === "audio" && !track.muted);
  const clips = sourceTracks.flatMap((track) => track.clips.filter((clip) => !clip.muted && clip.url).map((clip) => ({ track, clip })));
  if (!clips.length) throw new Error("No playable clips to render.");
  const endSec = Math.max(1, ...clips.map(({ clip }) => clip.start + visibleDuration(clip))) + 0.25;
  const renderRate = sampleRate || 48000;
  const OfflineCtx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!OfflineCtx || !AudioCtx) throw new Error("This browser does not support OfflineAudioContext rendering.");
  onProgress({ status: "Decoding clips", percent: 12 });
  const decodeCtx = new AudioCtx({ sampleRate: renderRate });
  const decoded = await Promise.all(clips.map(async ({ track, clip }, index) => {
    onProgress({ status: `Decoding ${clip.name}`, percent: 12 + Math.round((index / clips.length) * 32) });
    const data = await fetch(clip.url).then((res) => res.arrayBuffer());
    const buffer = await decodeCtx.decodeAudioData(data.slice(0));
    return { track, clip, buffer };
  }));
  await decodeCtx.close();
  onProgress({ status: "Building mix graph", percent: 52 });
  const offline = new OfflineCtx(2, Math.ceil(endSec * renderRate), renderRate);
  const master = offline.createGain();
  master.gain.value = Math.max(0, Math.min(1.25, masterVolume / 100));
  master.connect(offline.destination);
  decoded.forEach(({ track, clip, buffer }, index) => {
    const duration = Math.min(visibleDuration(clip), Math.max(0.05, buffer.duration - clip.trimStart - clip.trimEnd));
    const source = offline.createBufferSource();
    const gain = offline.createGain();
    const panner = typeof offline.createStereoPanner === "function" ? offline.createStereoPanner() : null;
    source.buffer = buffer;
    gain.gain.value = Math.max(0, track.volume / 100) * Math.pow(10, clip.gain / 20);
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, track.pan / 50));
      source.connect(gain).connect(panner).connect(master);
    } else {
      source.connect(gain).connect(master);
    }
    try { source.start(Math.max(0, clip.start), Math.max(0, clip.trimStart), duration); } catch { /* skip unrenderable clip */ }
    onProgress({ status: `Scheduled ${clip.name}`, percent: 52 + Math.round(((index + 1) / decoded.length) * 20) });
  });
  onProgress({ status: "Rendering WAV master", percent: 76 });
  const mixed = await offline.startRendering();
  onProgress({ status: "Encoding WAV", percent: 94 });
  return audioBufferToWav(mixed);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ElectricStudioWorkflow() {
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<Tool>("smart");
  const [tracks, setTracks] = useState<Track[]>([]);
  const tracksRef = useRef<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled Session");
  const [playhead, setPlayhead] = useState(0);
  const [zoom, setZoom] = useState(110);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [sampleRate, setSampleRate] = useState(48000);
  const [masterVolume, setMasterVolume] = useState(85);
  const [masterMeter, setMasterMeter] = useState(0);
  const [inputMeter, setInputMeter] = useState(0);
  const [inputReady, setInputReady] = useState(false);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [redoHistory, setRedoHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<RenderProgress>({ status: "Idle", percent: 0 });
  const [rendering, setRendering] = useState(false);
  const players = useRef<HTMLAudioElement[]>([]);
  const timer = useRef<number | null>(null);
  const playOrigin = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const inputStream = useRef<MediaStream | null>(null);
  const inputContext = useRef<AudioContext | null>(null);
  const meterAnimation = useRef<number | null>(null);
  const dragRef = useRef<{ clipId: string; trackId: string; mode: "move" | "trimStart" | "trimEnd"; startX: number; originalStart: number; originalTrimStart: number; originalTrimEnd: number } | null>(null);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks.find((track) => track.kind === "audio") ?? tracks[0] ?? null;
  const selectedClipRef = useMemo(() => {
    for (const track of tracks) {
      const clip = track.clips.find((item) => item.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  }, [tracks, selectedClipId]);
  const selectedClip = selectedClipRef?.clip ?? null;
  const armedTrack = tracks.find((track) => track.kind === "audio" && track.armed) ?? null;
  const sessionEnd = Math.max(10, ...tracks.flatMap((track) => track.clips.map((clip) => clip.start + visibleDuration(clip))));
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 420);
  const audioTracks = tracks.filter((track) => track.kind === "audio");

  useEffect(() => () => {
    stop();
    stopInputMeter();
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    tracksRef.current.flatMap((track) => track.clips).forEach((clip) => URL.revokeObjectURL(clip.url));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.code === "Space") { event.preventDefault(); play(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveSession(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") { event.preventDefault(); copyClip(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") { event.preventDefault(); pasteClip(); }
      if (event.key.toLowerCase() === "b") splitClip();
      if (event.key === "Delete" || event.key === "Backspace") deleteClip();
      if (event.key === "ArrowLeft") nudge(-1);
      if (event.key === "ArrowRight") nudge(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function commit(label: string, recipe: (draft: Track[]) => Track[]) {
    setTracks((current) => {
      setHistory((items) => [{ label, tracks: cloneTracks(current) }, ...items].slice(0, 80));
      setRedoHistory([]);
      return recipe(cloneTracks(current));
    });
    setDirty(true);
    setStatus(label);
  }

  function saveSession() {
    localStorage.setItem(sessionKey, JSON.stringify({ title, bpm, sampleRate, masterVolume, tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: "" })) })) }));
    setDirty(false);
    setStatus(`Saved ${new Date().toLocaleTimeString()}`);
  }

  function restoreSession() {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return setError("No saved local session found.");
    const saved = JSON.parse(raw) as { title: string; bpm: number; sampleRate: number; masterVolume?: number; tracks: Track[] };
    setTitle(`${saved.title} restored`);
    setBpm(saved.bpm);
    setSampleRate(saved.sampleRate);
    setMasterVolume(saved.masterVolume ?? 85);
    setTracks(saved.tracks.map((track) => ({ ...track, clips: [] })));
    setDirty(true);
    setStatus("Session metadata restored. Import/relink source audio.");
    setError("Session metadata restored. Audio files need to be re-imported because browser local save cannot persist blob URLs.");
  }

  function newSession() {
    if (dirty && !window.confirm("Start a new session and discard unsaved changes?")) return;
    stop();
    tracks.flatMap((track) => track.clips).forEach((clip) => URL.revokeObjectURL(clip.url));
    setTracks([]);
    setSelectedTrackId(null);
    setSelectedClipId(null);
    setTitle("Untitled Session");
    setPlayhead(0);
    setDirty(false);
    setHistory([]);
    setRedoHistory([]);
    setClipboard(null);
    setRenderProgress({ status: "Idle", percent: 0 });
    setStatus("New session");
  }

  function createTrack(kind: TrackKind) {
    const hasMaster = tracks.some((track) => track.kind === "master");
    if (kind === "master" && hasMaster) { setMode("mix"); return setStatus("Master track already exists"); }
    const next = makeTrack(kind, tracks.length, kind === "audio" && !armedTrack);
    commit(`Create ${kind} track`, (draft) => [...draft, next]);
    setSelectedTrackId(next.id);
  }

  function armTrack(id: string) {
    commit("Arm track", (draft) => draft.map((track) => ({ ...track, armed: track.kind === "audio" && track.id === id })));
    setSelectedTrackId(id);
  }

  async function addClipFromBlob(blob: Blob, name: string, type: string, targetTrackId?: string, start = 0) {
    const decoded = await decodeAudio(blob);
    const color = colors[tracksRef.current.length % colors.length];
    const clip: Clip = { id: uid("clip"), name, url: URL.createObjectURL(blob), type, size: blob.size, duration: decoded.duration, peaks: decoded.peaks, start, trimStart: 0, trimEnd: 0, gain: 0, muted: false, locked: false, color };
    setSampleRate(decoded.sampleRate);
    if (targetTrackId) {
      commit("Add clip", (draft) => draft.map((track) => track.id === targetTrackId ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
      setSelectedTrackId(targetTrackId);
      setSelectedClipId(clip.id);
    } else {
      const track = makeTrack("audio", tracksRef.current.length, tracksRef.current.every((item) => !item.armed));
      track.name = cleanName(name);
      track.color = color;
      track.clips = [clip];
      commit("Import audio track", (draft) => [...draft, track]);
      setSelectedTrackId(track.id);
      setSelectedClipId(clip.id);
    }
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) return setError("Choose WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.");
    setBusy(true);
    setError(null);
    try { for (const file of audioFiles) await addClipFromBlob(file, file.name, file.type || "audio/*"); }
    catch (err) { setError(err instanceof Error ? err.message : "Audio could not be decoded."); }
    finally { setBusy(false); }
  }

  async function prepareInputMeter() {
    if (inputReady) return;
    try {
      const stream = inputStream.current ?? await navigator.mediaDevices.getUserMedia({ audio: true });
      inputStream.current = stream;
      const ctx = new AudioContext();
      inputContext.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setInputReady(true);
      setStatus("Input meter active");
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const centered = (value - 128) / 128; sum += centered * centered; }
        setInputMeter(Math.min(100, Math.sqrt(sum / data.length) * 260));
        meterAnimation.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone input is unavailable.");
    }
  }

  function stopInputMeter() {
    if (meterAnimation.current) cancelAnimationFrame(meterAnimation.current);
    meterAnimation.current = null;
    inputContext.current?.close().catch(() => undefined);
    inputContext.current = null;
    inputStream.current?.getTracks().forEach((track) => track.stop());
    inputStream.current = null;
    setInputMeter(0);
    setInputReady(false);
    setStatus("Input meter stopped");
  }

  async function toggleRecord() {
    if (recording) { recorder.current?.stop(); return; }
    let target = armedTrack;
    if (!target) {
      target = makeTrack("audio", tracks.length, true);
      commit("Auto-create recording track", (draft) => [...draft.map((track) => ({ ...track, armed: false })), target as Track]);
      setSelectedTrackId(target.id);
    }
    try {
      const stream = inputStream.current ?? await navigator.mediaDevices.getUserMedia({ audio: true });
      inputStream.current = stream;
      if (!inputReady) void prepareInputMeter();
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      rec.onstop = async () => {
        setRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size) await addClipFromBlob(blob, `Take ${new Date().toLocaleTimeString()}.webm`, rec.mimeType || "audio/webm", target?.id, playhead);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setDirty(true);
      setStatus("Recording");
    } catch (err) { setError(err instanceof Error ? err.message : "Recording failed."); }
  }

  function stop() {
    players.current.forEach((audio) => { audio.pause(); audio.currentTime = 0; });
    players.current = [];
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
    setMasterMeter(0);
  }

  function play() {
    if (playing) return stop();
    const soloed = tracks.filter((track) => track.solo);
    const sourceTracks = soloed.length ? soloed : tracks;
    const clips = sourceTracks.flatMap((track) => track.kind === "audio" && !track.muted ? track.clips.filter((clip) => !clip.muted && playhead < clip.start + visibleDuration(clip)).map((clip) => ({ track, clip })) : []);
    if (!clips.length) return setError("No playable clips. Import audio or record a take first.");
    playOrigin.current = performance.now() / 1000 - playhead;
    players.current = clips.map(({ track, clip }) => {
      const audio = new Audio(clip.url);
      audio.volume = Math.min(1, (track.volume / 100) * (masterVolume / 100) * Math.pow(10, clip.gain / 20));
      audio.currentTime = Math.max(0, clip.trimStart + playhead - clip.start);
      setTimeout(() => void audio.play().catch((err) => setError(err instanceof Error ? err.message : "Playback failed.")), Math.max(0, clip.start - playhead) * 1000);
      return audio;
    });
    setPlaying(true);
    setStatus("Playing");
    timer.current = window.setInterval(() => {
      const next = performance.now() / 1000 - playOrigin.current;
      setPlayhead(next);
      setMasterMeter(computeMasterMeter(sourceTracks, next) * (masterVolume / 100));
      if (next >= sessionEnd) stop();
    }, 40);
  }

  function computeMasterMeter(sourceTracks: Track[], time: number) {
    let meter = 0;
    for (const track of sourceTracks) {
      for (const clip of track.clips) {
        if (time < clip.start || time > clip.start + visibleDuration(clip) || clip.muted) continue;
        const local = Math.max(0, Math.min(clip.duration, time - clip.start + clip.trimStart));
        const index = Math.min(clip.peaks.length - 1, Math.floor((local / clip.duration) * clip.peaks.length));
        meter += (clip.peaks[index] ?? 0) * (track.volume / 100) * Math.pow(10, clip.gain / 20);
      }
    }
    return Math.min(100, meter * 120);
  }

  function updateTrack(id: string, patch: Partial<Track>) { commit("Update track", (draft) => draft.map((track) => track.id === id ? { ...track, ...patch } : track)); }
  function updateClip(id: string, patch: Partial<Clip>) { commit("Update clip", (draft) => draft.map((track) => ({ ...track, clips: track.clips.map((clip) => clip.id === id && !clip.locked ? { ...clip, ...patch } : clip) }))); }
  function deleteTrack(id: string) { commit("Delete track", (draft) => draft.filter((track) => track.id !== id)); if (selectedTrackId === id) setSelectedTrackId(null); }
  function deleteClip() { if (!selectedClip) return; commit("Delete clip", (draft) => draft.map((track) => ({ ...track, clips: track.clips.filter((clip) => clip.id !== selectedClip.id) }))); setSelectedClipId(null); }

  function undo() {
    const item = history[0];
    if (!item) return;
    setRedoHistory((items) => [{ label: "Redo", tracks: cloneTracks(tracks) }, ...items].slice(0, 80));
    setTracks(cloneTracks(item.tracks));
    setHistory((items) => items.slice(1));
    setDirty(true);
    setStatus(`Undo: ${item.label}`);
  }

  function redo() {
    const item = redoHistory[0];
    if (!item) return;
    setHistory((items) => [{ label: "Undo", tracks: cloneTracks(tracks) }, ...items].slice(0, 80));
    setTracks(cloneTracks(item.tracks));
    setRedoHistory((items) => items.slice(1));
    setDirty(true);
    setStatus("Redo");
  }

  function splitClip() {
    if (!selectedClipRef || selectedClipRef.clip.locked) return;
    const { track, clip } = selectedClipRef;
    const local = playhead - clip.start;
    if (local <= 0.02 || local >= visibleDuration(clip) - 0.02) return setStatus("Place playhead inside selected clip to split");
    const left: Clip = { ...clip, id: uid("clip"), name: `${clip.name} A`, trimEnd: clip.trimEnd + visibleDuration(clip) - local };
    const right: Clip = { ...clip, id: uid("clip"), name: `${clip.name} B`, start: clip.start + local, trimStart: clip.trimStart + local };
    commit("Split clip", (draft) => draft.map((item) => item.id === track.id ? { ...item, clips: item.clips.flatMap((candidate) => candidate.id === clip.id ? [left, right] : [candidate]) } : item));
    setSelectedClipId(right.id);
  }

  function duplicateClip() {
    if (!selectedClipRef) return;
    const copy: Clip = { ...selectedClipRef.clip, id: uid("clip"), name: `${selectedClipRef.clip.name} copy`, start: selectedClipRef.clip.start + visibleDuration(selectedClipRef.clip) + 0.1, locked: false };
    commit("Duplicate clip", (draft) => draft.map((track) => track.id === selectedClipRef.track.id ? { ...track, clips: [...track.clips, copy].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(copy.id);
  }

  function renameClip() {
    if (!selectedClip) return;
    const next = window.prompt("Rename clip", selectedClip.name);
    if (next) updateClip(selectedClip.id, { name: next });
  }

  function copyClip() { if (selectedClip) { setClipboard({ ...selectedClip }); setStatus("Copied clip"); } }
  function cutClip() { if (!selectedClip) return; setClipboard({ ...selectedClip }); deleteClip(); setStatus("Cut clip"); }
  function pasteClip() {
    if (!clipboard || !selectedTrack || selectedTrack.kind !== "audio") return;
    const pasted: Clip = { ...clipboard, id: uid("clip"), name: `${clipboard.name} paste`, start: playhead, locked: false };
    commit("Paste clip", (draft) => draft.map((track) => track.id === selectedTrack.id ? { ...track, clips: [...track.clips, pasted].sort((a, b) => a.start - b.start) } : track));
    setSelectedClipId(pasted.id);
  }

  function nudge(direction: -1 | 1) { if (selectedClip) updateClip(selectedClip.id, { start: Math.max(0, selectedClip.start + direction * 0.1) }); }

  function startClipGesture(event: React.MouseEvent, trackId: string, clip: Clip, gestureMode: "move" | "trimStart" | "trimEnd") {
    event.preventDefault();
    event.stopPropagation();
    if (clip.locked) return;
    setSelectedTrackId(trackId);
    setSelectedClipId(clip.id);
    dragRef.current = { clipId: clip.id, trackId, mode: gestureMode, startX: event.clientX, originalStart: clip.start, originalTrimStart: clip.trimStart, originalTrimEnd: clip.trimEnd };
    const onMove = (moveEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const seconds = (moveEvent.clientX - drag.startX) / zoom;
      setTracks((current) => current.map((track) => ({ ...track, clips: track.clips.map((item) => {
        if (item.id !== drag.clipId) return item;
        if (drag.mode === "move") return { ...item, start: Math.max(0, drag.originalStart + seconds) };
        if (drag.mode === "trimStart") {
          const nextTrim = Math.max(0, Math.min(item.duration - 0.05, drag.originalTrimStart + seconds));
          return { ...item, trimStart: nextTrim, start: Math.max(0, drag.originalStart + (nextTrim - drag.originalTrimStart)) };
        }
        return { ...item, trimEnd: Math.max(0, Math.min(item.duration - 0.05, drag.originalTrimEnd - seconds)) };
      }) })));
    };
    const onUp = (upEvent: MouseEvent) => {
      const drag = dragRef.current;
      if (drag?.mode === "move") {
        const targetLane = document.elementsFromPoint(upEvent.clientX, upEvent.clientY).find((item) => item instanceof HTMLElement && item.dataset.trackId) as HTMLElement | undefined;
        const targetTrackId = targetLane?.dataset.trackId;
        if (targetTrackId && targetTrackId !== drag.trackId) {
          setTracks((current) => {
            const moving = current.flatMap((track) => track.clips).find((item) => item.id === drag.clipId);
            if (!moving) return current;
            return current.map((track) => {
              if (track.id === drag.trackId) return { ...track, clips: track.clips.filter((item) => item.id !== drag.clipId) };
              if (track.id === targetTrackId && track.kind === "audio") return { ...track, clips: [...track.clips, moving].sort((a, b) => a.start - b.start) };
              return track;
            });
          });
          setSelectedTrackId(targetTrackId);
        }
      }
      dragRef.current = null;
      setDirty(true);
      setStatus("Clip edit complete");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function downloadClip(track: Track, clip: Clip) {
    const a = document.createElement("a");
    a.href = clip.url;
    a.download = `${slug(track.name)}-${slug(clip.name)}.${clipExt(clip)}`;
    a.click();
  }

  function downloadAll() { tracks.forEach((track) => track.clips.forEach((clip) => downloadClip(track, clip))); }
  function exportArchive() {
    const archive = { title, bpm, sampleRate, masterVolume, exportedAt: new Date().toISOString(), tracks: tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, url: "" })) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}-studio-archive.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function renderWavExport() {
    if (rendering) return;
    setRendering(true);
    setError(null);
    setRenderProgress({ status: "Starting WAV render", percent: 4 });
    setStatus("Rendering WAV master");
    try {
      const wav = await renderWavMaster(tracks, masterVolume, sampleRate, setRenderProgress);
      downloadBlob(wav, `${slug(title)}-wav-master.wav`);
      setRenderProgress({ status: "WAV master downloaded", percent: 100 });
      setStatus("WAV master rendered");
    } catch (err) {
      const message = err instanceof Error ? err.message : "WAV render failed.";
      setError(message);
      setRenderProgress({ status: message, percent: 0 });
      setStatus("WAV render failed");
    } finally {
      setRendering(false);
    }
  }

  async function requestMp3Demo() {
    setRenderProgress({ status: "MP3 needs an encoder/worker. WAV renderer is active; MP3 queue endpoint exists server-side.", percent: 0 });
    setStatus("MP3 renderer not installed");
  }

  const button = "bg-[#30343b] px-3 py-2 hover:bg-[#3f4650]";

  return <div className="grid h-dvh grid-rows-[34px_44px_1fr_24px] overflow-hidden bg-[#111316] text-[#d8d8d8]">
    <header className="flex items-center border-b border-black bg-[#26282c] text-[11px] font-black uppercase tracking-[0.16em] text-white/70">
      <button onClick={() => setMode("edit")} className="h-full border-r border-black px-4 text-cyan-200">EMS Studio</button>
      {(["edit", "mix", "export", "files"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("h-full border-r border-black px-5", mode === item ? "bg-[#d8d2bd] text-black" : "bg-[#303238]")}>{item}</button>)}
      <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="ml-3 w-72 bg-black px-3 py-1 font-mono text-cyan-200 outline-none" />
      <span className={cn("ml-3 px-2 py-1", dirty ? "bg-yellow-400 text-black" : "bg-green-500 text-black")}>{dirty ? "Dirty" : "Saved"}</span>
      <span className="ml-auto bg-black px-3 py-1 font-mono text-green-300">{formatTime(playhead)}</span>
    </header>

    <nav className="flex items-center gap-2 overflow-x-auto border-b border-black bg-[#1d2025] px-3 text-[10px] font-black uppercase tracking-widest text-white/65">
      <button onClick={newSession} className={button}>New</button>
      <button onClick={() => createTrack("audio")} className="bg-cyan-300 px-3 py-2 text-black">New Track</button>
      <button onClick={() => createTrack("audio")} className={button}>Audio</button>
      <button onClick={() => createTrack("aux")} className={button}>Aux</button>
      <button onClick={() => createTrack("master")} className={button}>Master</button>
      <span className="h-6 border-l border-white/15" />
      <button onClick={saveSession} className={button}>Save</button>
      <button onClick={restoreSession} className={button}>Restore</button>
      <button onClick={undo} className={button}>Undo</button>
      <button onClick={redo} className={button}>Redo</button>
      <span className="h-6 border-l border-white/15" />
      <button onClick={() => setPlayhead(0)} className={button}>|&lt;</button>
      <button onClick={stop} className={button}>Stop</button>
      <button onClick={play} className={cn("px-4 py-2 text-black", playing ? "bg-red-500" : "bg-green-400")}>{playing ? "Pause" : "Play"}</button>
      <button onClick={toggleRecord} className={cn("px-4 py-2 text-black", recording ? "bg-red-500 animate-pulse" : "bg-red-400")}>{recording ? "Stop Rec" : "Record"}</button>
      <button onClick={prepareInputMeter} className={button}>Input</button>
      <button onClick={stopInputMeter} className={button}>Stop Input</button>
      <label className="cursor-pointer bg-[#353941] px-3 py-2 text-cyan-100 hover:bg-[#444b55]">{busy ? "Importing" : "Import"}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(e) => e.target.files && void importFiles(e.target.files)} /></label>
      {(["smart", "selector", "grabber", "trim", "zoomer"] as Tool[]).map((item) => <button key={item} onClick={() => setTool(item)} className={cn("px-2 py-2", tool === item ? "bg-[#d8d2bd] text-black" : "bg-[#30343b]")}>{item}</button>)}
      <button onClick={() => setZoom((z) => Math.max(35, z - 25))} className={button}>-</button>
      <button onClick={() => setZoom((z) => Math.min(520, z + 25))} className={button}>+</button>
      <span className="ml-auto whitespace-nowrap">Target: <b className="text-red-300">{armedTrack?.name ?? "auto-create audio track"}</b></span>
    </nav>

    {error && <div className="absolute left-3 right-3 top-20 z-50 border border-yellow-400/50 bg-yellow-950 px-4 py-3 text-sm font-bold text-yellow-100"><button onClick={() => setError(null)} className="mr-3 bg-yellow-300 px-2 py-1 text-black">Dismiss</button>{error}</div>}
    {mode === "edit" && <EditPane tracks={tracks} selectedTrack={selectedTrack} selectedClip={selectedClip} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} updateTrack={updateTrack} updateClip={updateClip} armTrack={armTrack} deleteTrack={deleteTrack} deleteClip={deleteClip} splitClip={splitClip} duplicateClip={duplicateClip} renameClip={renameClip} copyClip={copyClip} cutClip={cutClip} pasteClip={pasteClip} nudge={nudge} zoom={zoom} timelineWidth={timelineWidth} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} startClipGesture={startClipGesture} importFiles={importFiles} inputMeter={inputMeter} inputReady={inputReady} masterVolume={masterVolume} setMasterVolume={setMasterVolume} masterMeter={masterMeter} bpm={bpm} setBpm={setBpm} sampleRate={sampleRate} setSampleRate={setSampleRate} />}
    {mode === "mix" && <MixerPane tracks={tracks} updateTrack={updateTrack} armTrack={armTrack} masterVolume={masterVolume} setMasterVolume={setMasterVolume} masterMeter={masterMeter} inputMeter={inputMeter} />}
    {mode === "export" && <ExportPane title={title} tracks={tracks} selectedClipRef={selectedClipRef} downloadClip={downloadClip} downloadAll={downloadAll} exportArchive={exportArchive} renderWavExport={renderWavExport} requestMp3Demo={requestMp3Demo} rendering={rendering} renderProgress={renderProgress} />}
    {mode === "files" && <FilesPane title={title} tracks={tracks} saveSession={saveSession} restoreSession={restoreSession} exportArchive={exportArchive} />}
    <footer className="flex items-center border-t border-black bg-[#15171b] px-3 text-[10px] uppercase tracking-widest text-white/45"><span>{status}</span><span className="ml-auto">{audioTracks.length} audio tracks · {tracks.flatMap((track) => track.clips).length} clips · {inputReady ? "input live" : "input off"}</span></footer>
  </div>;
}

function EditPane({ tracks, selectedTrack, selectedClip, selectedClipId, setSelectedTrackId, setSelectedClipId, updateTrack, updateClip, armTrack, deleteTrack, deleteClip, splitClip, duplicateClip, renameClip, copyClip, cutClip, pasteClip, nudge, zoom, timelineWidth, playhead, setPlayhead, sessionEnd, startClipGesture, importFiles, inputMeter, inputReady, masterVolume, setMasterVolume, masterMeter, bpm, setBpm, sampleRate, setSampleRate }: { tracks: Track[]; selectedTrack: Track | null; selectedClip: Clip | null; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void; updateTrack: (id: string, patch: Partial<Track>) => void; updateClip: (id: string, patch: Partial<Clip>) => void; armTrack: (id: string) => void; deleteTrack: (id: string) => void; deleteClip: () => void; splitClip: () => void; duplicateClip: () => void; renameClip: () => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; nudge: (direction: -1 | 1) => void; zoom: number; timelineWidth: number; playhead: number; setPlayhead: (time: number) => void; sessionEnd: number; startClipGesture: (event: React.MouseEvent, trackId: string, clip: Clip, mode: "move" | "trimStart" | "trimEnd") => void; importFiles: (files: FileList | File[]) => Promise<void>; inputMeter: number; inputReady: boolean; masterVolume: number; setMasterVolume: (value: number) => void; masterMeter: number; bpm: number; setBpm: (value: number) => void; sampleRate: number; setSampleRate: (value: number) => void }) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  return <main className="grid min-h-0 grid-cols-[250px_1fr_270px] overflow-hidden bg-[#171a1f]">
    <aside className="grid min-h-0 grid-rows-[36px_1fr_270px] border-r border-black bg-[#252930]">
      <div className="border-b border-black bg-[#30343b] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55">Tracks</div>
      <div className="overflow-auto">{tracks.length === 0 && <div className="p-3 text-xs text-white/45">Create an audio track, import audio, or press Record to auto-create a target.</div>}{tracks.map((track) => <button key={track.id} onClick={() => setSelectedTrackId(track.id)} className={cn("grid min-h-[78px] w-full grid-cols-[8px_1fr_68px] border-b border-black text-left", selectedTrack?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]")}><span style={{ backgroundColor: track.color }} /><span className="min-w-0 px-3 py-2"><b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b><span className="text-[10px] uppercase tracking-wide text-white/40">{track.kind} · {track.clips.length} clips</span><span className="mt-2 block h-2 bg-black"><span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} /></span></span><span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase"><button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>M</button><button onClick={(e) => { e.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>S</button><button disabled={track.kind !== "audio"} onClick={(e) => { e.stopPropagation(); armTrack(track.id); }} className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45 disabled:opacity-25"}>Rec</button></span></button>)}</div>
      <Inspector track={selectedTrack} clip={selectedClip} updateTrack={updateTrack} updateClip={updateClip} deleteTrack={deleteTrack} deleteClip={deleteClip} splitClip={splitClip} duplicateClip={duplicateClip} renameClip={renameClip} copyClip={copyClip} cutClip={cutClip} pasteClip={pasteClip} nudge={nudge} />
    </aside>
    <section className="grid min-h-0 grid-rows-[38px_1fr_36px] overflow-hidden" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void importFiles(Array.from(e.dataTransfer.files)); }}>
      <div className="relative border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}>{seconds.map((second) => <button key={second} onClick={() => setPlayhead(second)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: second * zoom, width: zoom }}>{second % 2 ? second : formatTime(second)}</button>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} /></div>
      {tracks.length === 0 ? <div className="grid place-items-center"><div className="text-center"><h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2><p className="mt-3 text-sm text-white/50">New Track, Import, or Record. Audio tracks are real; no fake clips.</p></div></div> : <div className="overflow-auto"><div className="relative" style={{ width: timelineWidth }}>{tracks.map((track) => <div key={track.id} data-track-id={track.id} className="relative h-[82px] border-b border-black bg-[#1b1f26]"><div className="absolute inset-0">{seconds.map((second) => <span key={second} className="absolute bottom-0 top-0 border-r border-black/70" style={{ left: second * zoom, width: zoom }} />)}</div>{track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}{track.clips.map((clip) => <div key={clip.id} role="button" tabIndex={0} onMouseDown={(event) => startClipGesture(event, track.id, clip, "move")} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("absolute top-[9px] h-[64px] border px-3 text-left shadow-inner", selectedClipId === clip.id && "ring-2 ring-white", clip.locked && "opacity-60")} style={{ left: clip.start * zoom, width: Math.max(52, visibleDuration(clip) * zoom), borderColor: clip.color, backgroundColor: `${clip.color}24`, cursor: "grab" }}><button aria-label="Trim clip start" onMouseDown={(event) => startClipGesture(event, track.id, clip, "trimStart")} className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize bg-white/20 hover:bg-cyan-200" /><button aria-label="Trim clip end" onMouseDown={(event) => startClipGesture(event, track.id, clip, "trimEnd")} className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize bg-white/20 hover:bg-cyan-200" /><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color }}>{clip.muted ? "MUTED · " : ""}{clip.name}</b><Wave peaks={clip.peaks} color={clip.color} gain={clip.gain} /><span className="absolute bottom-1 left-3 text-[9px] uppercase text-white/45">drag to move · edge handles trim</span></div>)}</div>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} /></div></div>}
      <input type="range" min={0} max={sessionEnd} step={0.01} value={playhead} onChange={(e) => setPlayhead(Number(e.target.value))} className="w-full accent-cyan-300" />
    </section>
    <aside className="grid min-h-0 grid-rows-[36px_1fr_190px] border-l border-black bg-[#20242b]"><div className="border-b border-black bg-[#30343b] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/55">Studio I/O</div><div className="overflow-auto p-3 text-xs text-white/60"><label className="block uppercase">BPM <input value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 92)} className="mt-1 w-full bg-black px-2 py-2 text-green-300" /></label><label className="mt-3 block uppercase">Sample Rate <select value={sampleRate} onChange={(e) => setSampleRate(Number(e.target.value))} className="mt-1 w-full bg-black px-2 py-2 text-green-300"><option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option><option value={96000}>96 kHz</option></select></label><Meter label={inputReady ? "Input meter" : "Input meter idle"} value={inputMeter} /><Meter label="Master meter" value={masterMeter} /><label className="mt-3 block uppercase">Master Fader {masterVolume}<input type="range" min="0" max="100" value={masterVolume} onChange={(e) => setMasterVolume(Number(e.target.value))} className="w-full accent-[#d8d2bd]" /></label></div><RegionList tracks={tracks} selectedClipId={selectedClipId} setSelectedTrackId={setSelectedTrackId} setSelectedClipId={setSelectedClipId} /></aside>
  </main>;
}

function Wave({ peaks, color, gain }: { peaks: number[]; color: string; gain: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const canvas = ref.current; const parent = canvas?.parentElement; if (!canvas || !parent) return; const draw = () => { const rect = parent.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1; canvas.width = Math.max(1, Math.floor(rect.width * ratio)); canvas.height = Math.floor(34 * ratio); canvas.style.width = `${rect.width}px`; canvas.style.height = "34px"; const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, rect.width, 34); ctx.fillStyle = color; const visible = Math.max(1, Math.floor(rect.width)); const step = peaks.length / visible; const center = 17; const scale = Math.pow(10, gain / 20); for (let x = 0; x < visible; x += 1) { const peak = Math.min(1, (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * scale); const h = Math.max(1, peak * 32); ctx.fillRect(x, center - h / 2, 1, h); } }; draw(); const observer = new ResizeObserver(draw); observer.observe(parent); return () => observer.disconnect(); }, [peaks, color, gain]);
  return <canvas ref={ref} className="mt-1 block w-full bg-black/20" />;
}

function Meter({ label, value }: { label: string; value: number }) { return <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] uppercase text-white/45"><span>{label}</span><span>{Math.round(value)}</span></div><div className="h-3 bg-black"><div className={cn("h-full", value > 88 ? "bg-red-500" : value > 68 ? "bg-yellow-300" : "bg-green-400")} style={{ width: `${Math.min(100, value)}%` }} /></div></div>; }

function Inspector({ track, clip, updateTrack, updateClip, deleteTrack, deleteClip, splitClip, duplicateClip, renameClip, copyClip, cutClip, pasteClip, nudge }: { track: Track | null; clip: Clip | null; updateTrack: (id: string, patch: Partial<Track>) => void; updateClip: (id: string, patch: Partial<Clip>) => void; deleteTrack: (id: string) => void; deleteClip: () => void; splitClip: () => void; duplicateClip: () => void; renameClip: () => void; copyClip: () => void; cutClip: () => void; pasteClip: () => void; nudge: (direction: -1 | 1) => void }) {
  if (!track) return <div className="border-t border-black bg-[#20242b] p-3 text-xs text-white/45">No track selected.</div>;
  return <div className="overflow-auto border-t border-black bg-[#20242b] p-3 text-xs"><b className="block truncate uppercase" style={{ color: track.color }}>{track.name}</b><span className="text-white/40">{track.kind}</span><label className="mt-2 block uppercase text-white/40">Volume {track.volume}<input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Pan {track.pan}<input type="range" min="-50" max="50" value={track.pan} onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })} className="w-full accent-cyan-300" /></label><button onClick={() => deleteTrack(track.id)} className="mt-2 w-full bg-red-500 py-1 text-[9px] font-black uppercase text-black">Delete Track</button>{clip && <div className="mt-3 border-t border-black pt-3"><b className="block truncate uppercase text-white/70">{clip.name}</b><div className="mt-2 grid grid-cols-2 gap-1 text-[9px] font-black uppercase"><button onClick={splitClip} className="bg-[#111] py-1 text-white/55">Split</button><button onClick={duplicateClip} className="bg-[#111] py-1 text-white/55">Duplicate</button><button onClick={renameClip} className="bg-[#111] py-1 text-white/55">Rename</button><button onClick={deleteClip} className="bg-red-500 py-1 text-black">Delete</button><button onClick={() => nudge(-1)} className="bg-[#111] py-1 text-white/55">Nudge -</button><button onClick={() => nudge(1)} className="bg-[#111] py-1 text-white/55">Nudge +</button><button onClick={copyClip} className="bg-[#111] py-1 text-white/55">Copy</button><button onClick={cutClip} className="bg-[#111] py-1 text-white/55">Cut</button><button onClick={pasteClip} className="bg-[#111] py-1 text-white/55">Paste</button><button onClick={() => updateClip(clip.id, { locked: !clip.locked })} className={clip.locked ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Lock</button><button onClick={() => updateClip(clip.id, { muted: !clip.muted })} className={clip.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Mute</button></div><label className="mt-2 block uppercase text-white/40">Clip Gain {clip.gain} dB<input type="range" min="-24" max="24" value={clip.gain} onChange={(e) => updateClip(clip.id, { gain: Number(e.target.value) })} className="w-full accent-yellow-300" /></label></div>}</div>;
}

function RegionList({ tracks, selectedClipId, setSelectedTrackId, setSelectedClipId }: { tracks: Track[]; selectedClipId: string | null; setSelectedTrackId: (id: string) => void; setSelectedClipId: (id: string) => void }) {
  const regions = tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip })));
  return <div className="overflow-auto border-t border-black p-2 text-[10px] text-white/45"><b className="mb-2 block uppercase text-white/70">Regions</b>{regions.map(({ track, clip }) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); }} className={cn("mb-1 block w-full border border-black p-2 text-left", selectedClipId === clip.id ? "bg-[#3a3d45]" : "bg-[#252930]")}><span className="block truncate uppercase" style={{ color: clip.color }}>{clip.name}</span><span>{track.name} · {formatTime(clip.start)}</span></button>)}</div>;
}

function MixerPane({ tracks, updateTrack, armTrack, masterVolume, setMasterVolume, masterMeter, inputMeter }: { tracks: Track[]; updateTrack: (id: string, patch: Partial<Track>) => void; armTrack: (id: string) => void; masterVolume: number; setMasterVolume: (value: number) => void; masterMeter: number; inputMeter: number }) {
  return <main className="h-full overflow-auto bg-[#20242b]"><div className="flex min-h-full min-w-max border-l border-black"><div className="grid w-[138px] grid-rows-[40px_72px_1fr_70px] border-r border-black bg-[#24282f] text-center"><div className="border-b border-black bg-[#3a3f47] py-3 text-[10px] font-black uppercase tracking-widest text-[#d8d2bd]">Master</div><div className="border-b border-black p-2"><Meter label="Master" value={masterMeter} /><Meter label="Input" value={inputMeter} /></div><div className="grid place-items-center border-b border-black p-3"><input type="range" min="0" max="100" value={masterVolume} onChange={(e) => setMasterVolume(Number(e.target.value))} className="h-52 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div><div className="grid place-items-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{masterVolume}</div></div>{tracks.map((track, index) => <div key={track.id} className="grid w-[124px] grid-rows-[40px_86px_76px_1fr_58px] border-r border-black bg-[#2d3138] text-center"><div className="border-b border-black bg-[#3a3f47] py-3 text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>{track.kind} {index + 1}</div><div className="border-b border-black p-2"><b className="block truncate text-[11px] uppercase text-white/80">{track.name}</b><span className="text-[9px] text-white/35">{track.clips.length} clips</span><button disabled={track.kind !== "audio"} onClick={() => armTrack(track.id)} className={track.armed ? "mt-2 w-full bg-red-500 py-1 text-[9px] font-black uppercase text-black" : "mt-2 w-full bg-[#15171b] py-1 text-[9px] font-black uppercase text-white/45 disabled:opacity-30"}>Rec</button></div><div className="grid grid-cols-2 gap-px border-b border-black p-2 text-[9px] font-black uppercase"><button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>Mute</button><button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>Solo</button><label className="col-span-2 mt-2 text-white/40">Pan<input type="range" min="-50" max="50" value={track.pan} onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) })} className="w-full accent-cyan-300" /></label></div><div className="grid grid-cols-[22px_1fr] gap-2 border-b border-black p-3"><div className="relative bg-black"><span className="absolute bottom-0 left-0 right-0 bg-green-400" style={{ height: `${Math.min(100, track.volume)}%` }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="h-full w-12 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div><div className="grid place-items-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{track.volume}</div></div>)}</div></main>;
}

function ExportPane({ title, tracks, selectedClipRef, downloadClip, downloadAll, exportArchive, renderWavExport, requestMp3Demo, rendering, renderProgress }: { title: string; tracks: Track[]; selectedClipRef: { track: Track; clip: Clip } | null; downloadClip: (track: Track, clip: Clip) => void; downloadAll: () => void; exportArchive: () => void; renderWavExport: () => Promise<void>; requestMp3Demo: () => Promise<void>; rendering: boolean; renderProgress: RenderProgress }) {
  const clipCount = tracks.flatMap((track) => track.clips).length;
  return <main className="grid h-full place-items-center bg-[#20242b] p-6"><div className="max-w-3xl text-center"><h2 className="text-3xl font-black uppercase tracking-widest text-cyan-100">Export</h2><p className="mt-3 text-sm text-white/55">{title} · {tracks.length} tracks · {clipCount} clips</p><div className="mt-5 flex flex-wrap justify-center gap-3"><button disabled={!clipCount || rendering} onClick={() => void renderWavExport()} className="bg-green-400 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Render WAV Master</button><button disabled={!clipCount || rendering} onClick={() => void requestMp3Demo()} className="border border-yellow-300/40 px-6 py-3 text-xs font-black uppercase text-yellow-100 disabled:opacity-40">MP3 Demo Path</button><button disabled={!selectedClipRef} onClick={() => selectedClipRef && downloadClip(selectedClipRef.track, selectedClipRef.clip)} className="bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download Selected Clip</button><button disabled={!clipCount} onClick={downloadAll} className="border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download All Clips</button><button onClick={exportArchive} className="border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70">Export Session Archive</button></div><div className="mx-auto mt-6 max-w-xl rounded-2xl border border-white/10 bg-black/35 p-4 text-left"><div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/45"><span>{renderProgress.status}</span><span>{renderProgress.percent}%</span></div><div className="mt-2 h-3 bg-black"><div className="h-full bg-green-400" style={{ width: `${Math.max(0, Math.min(100, renderProgress.percent))}%` }} /></div><p className="mt-3 text-xs leading-5 text-white/50">WAV master rendering is real browser-side mixdown using OfflineAudioContext. MP3 still needs an encoder or worker; the app now shows that path honestly instead of fake-exporting MP3.</p></div></div></main>;
}

function FilesPane({ title, tracks, saveSession, restoreSession, exportArchive }: { title: string; tracks: Track[]; saveSession: () => void; restoreSession: () => void; exportArchive: () => void }) {
  return <main className="grid h-full grid-cols-3 bg-[#20242b] text-sm"><section className="border-r border-black p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Session</h2><p className="mt-3 text-white/60">{title}</p><p className="mt-2 text-white/45">{tracks.length} tracks · {tracks.flatMap((track) => track.clips).length} clips</p><button onClick={saveSession} className="mt-4 bg-cyan-300 px-4 py-2 text-xs font-black uppercase text-black">Save Local Metadata</button><button onClick={restoreSession} className="ml-2 mt-4 border border-white/20 px-4 py-2 text-xs font-black uppercase text-white/70">Restore</button><button onClick={exportArchive} className="ml-2 mt-4 border border-white/20 px-4 py-2 text-xs font-black uppercase text-white/70">Archive</button></section><section className="border-r border-black p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Track Types</h2><p className="mt-3 text-white/60">Audio records and plays clips. Aux and Master are mix/control surfaces for routing-ready workflow.</p></section><section className="p-4"><h2 className="text-lg font-black uppercase text-cyan-100">Wired Controls</h2><ul className="mt-3 space-y-2 text-white/60"><li>New, save, restore, undo, redo</li><li>Audio, aux, master track creation</li><li>Import, record, play, stop, input meter</li><li>Drag clips horizontally and between audio tracks</li><li>Trim handles, split, duplicate, rename, copy, cut, paste</li><li>Browser WAV master renderer, master fader, master meter, clip export, archive export</li></ul></section></main>;
}
