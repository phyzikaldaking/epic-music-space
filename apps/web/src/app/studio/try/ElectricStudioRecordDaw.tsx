"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RulerMode = "bars" | "time" | "samples" | "timecode";
type TrackKind = "audio" | "aux" | "master";
type StopMode = "pause" | "return";
type Clip = {
  id: string;
  name: string;
  url: string;
  type: string;
  duration: number;
  start: number;
  color: string;
  peaks: number[];
  takeLane: number;
  source: "import" | "recording";
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

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e"];
const sampleRate = 48000;
const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds || 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatTimecode(seconds: number) {
  const fps = 30;
  const safe = Math.max(0, seconds || 0);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe % 1) * fps);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function formatRuler(seconds: number, mode: RulerMode, bpm: number) {
  if (mode === "time") return formatTime(seconds);
  if (mode === "samples") return `${Math.round(seconds * sampleRate).toLocaleString()} smp`;
  if (mode === "timecode") return formatTimecode(seconds);
  const beat = Math.floor((seconds / 60) * bpm);
  return `${Math.floor(beat / 4) + 1}|${(beat % 4) + 1}`;
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

function visibleDuration(clip: Clip) {
  return Math.max(0.05, clip.duration);
}

async function decodeBlob(file: Blob, peakCount = 2400) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const block = Math.max(1, Math.floor(buffer.length / peakCount));
    const peaks = Array.from({ length: peakCount }, (_, index) => {
      let max = 0;
      const start = index * block;
      const end = Math.min(buffer.length, start + block);
      for (let i = start; i < end; i += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[i] ?? 0);
        max = Math.max(max, sample / channels.length);
      }
      return Number(max.toFixed(5));
    });
    return { duration: buffer.duration, peaks };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function Wave({ peaks, color, zoom }: { peaks: number[]; color: string; zoom: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const height = 42;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, rect.width, height);
      ctx.fillStyle = color;
      const width = Math.max(1, Math.floor(rect.width));
      const step = peaks.length / width;
      for (let x = 0; x < width; x += 1) {
        const peak = Math.min(1, (peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0) * zoom);
        const h = Math.max(1, Math.round(peak * (height - 2)));
        ctx.fillRect(x, Math.round(height / 2 - h / 2), 1, h);
      }
      ctx.fillStyle = "rgba(255,255,255,.22)";
      ctx.fillRect(0, Math.round(height / 2), width, 1);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [peaks, color, zoom]);
  return <canvas ref={ref} className="block w-full bg-black/25" />;
}

function overlap(start: number, duration: number, clip: Clip) {
  const aEnd = start + duration;
  const bEnd = clip.start + visibleDuration(clip);
  return start < bEnd && aEnd > clip.start;
}

export default function ElectricStudioRecordDaw() {
  const [tracks, setTracks] = useState<Track[]>([makeTrack("audio", 0, true), makeTrack("master", 1)]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [bpm, setBpm] = useState(120);
  const [rulerMode, setRulerMode] = useState<RulerMode>("bars");
  const [zoom, setZoom] = useState(160);
  const [waveZoom, setWaveZoom] = useState(1.25);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [countInBeats, setCountInBeats] = useState(4);
  const [countInDisplay, setCountInDisplay] = useState<number | null>(null);
  const [stopMode, setStopMode] = useState<StopMode>("pause");
  const [inputMeter, setInputMeter] = useState(0);
  const [recordTake, setRecordTake] = useState(1);
  const [protectOverwrite, setProtectOverwrite] = useState(true);
  const [status, setStatus] = useState("Ready");

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordStartRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const meterRef = useRef<number | null>(null);
  const playbackStartRef = useRef(0);
  const playheadStartRef = useRef(0);
  const beatTimerRef = useRef<number | null>(null);

  const allClips = useMemo(() => tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip }))), [tracks]);
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? tracks.find((track) => track.armed && track.kind === "audio") ?? tracks.find((track) => track.kind === "audio") ?? null;
  const armedTrack = tracks.find((track) => track.kind === "audio" && track.armed) ?? selectedTrack;
  const selectedClip = allClips.find(({ clip }) => clip.id === selectedClipId)?.clip ?? null;
  const sessionEnd = Math.max(12, ...allClips.map(({ clip }) => clip.start + visibleDuration(clip)));
  const timelineWidth = Math.max(1400, sessionEnd * zoom + 360);
  const beatSeconds = 60 / Math.max(40, bpm);
  const barSeconds = beatSeconds * 4;
  const gridSeconds = beatSeconds;
  const ticks = useMemo(() => {
    const step = rulerMode === "bars" ? beatSeconds : 1;
    return Array.from({ length: Math.ceil(sessionEnd / step) + 1 }, (_, index) => Number((index * step).toFixed(3)));
  }, [beatSeconds, rulerMode, sessionEnd]);

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (meterRef.current) cancelAnimationFrame(meterRef.current);
    if (beatTimerRef.current) window.clearInterval(beatTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioCtxRef.current?.close().catch(() => undefined);
  }, []);

  function getAudioContext() {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
    return audioCtxRef.current;
  }

  function click(accent = false) {
    if (!metronomeEnabled) return;
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.28 : 0.16, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.065);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.075);
  }

  function startMetronome() {
    if (beatTimerRef.current) window.clearInterval(beatTimerRef.current);
    let beat = 0;
    click(true);
    beatTimerRef.current = window.setInterval(() => {
      beat += 1;
      click(beat % 4 === 0);
    }, beatSeconds * 1000);
  }

  function stopMetronome() {
    if (beatTimerRef.current) window.clearInterval(beatTimerRef.current);
    beatTimerRef.current = null;
  }

  function transportTick() {
    const elapsed = (performance.now() - playbackStartRef.current) / 1000;
    const next = playheadStartRef.current + elapsed;
    if (next >= sessionEnd) {
      setPlayhead(sessionEnd);
      setIsPlaying(false);
      stopMetronome();
      setStatus("Playback complete");
      return;
    }
    setPlayhead(next);
    animationRef.current = requestAnimationFrame(transportTick);
  }

  async function countIn() {
    if (countInBeats <= 0) return;
    setStatus("Count-in running");
    for (let beat = countInBeats; beat >= 1; beat -= 1) {
      setCountInDisplay(beat);
      click(beat === countInBeats);
      await new Promise((resolve) => setTimeout(resolve, beatSeconds * 1000));
    }
    setCountInDisplay(null);
  }

  async function play(withCountIn = false) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (withCountIn) await countIn();
    playbackStartRef.current = performance.now();
    playheadStartRef.current = playhead;
    setIsPlaying(true);
    startMetronome();
    setStatus("Playing");
    animationRef.current = requestAnimationFrame(transportTick);
  }

  function stop() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    setIsPlaying(false);
    stopMetronome();
    if (stopMode === "return") setPlayhead(0);
    setStatus(stopMode === "return" ? "Stopped and returned to zero" : "Stopped at playhead");
  }

  function createTrack(kind: TrackKind, forceArm = false) {
    if (kind === "master" && tracks.some((track) => track.kind === "master")) {
      setStatus("Master track already exists");
      return null;
    }
    const next = makeTrack(kind, tracks.length, kind === "audio" && (forceArm || !tracks.some((track) => track.armed)));
    setTracks((current) => kind === "audio" && next.armed ? [...current.map((track) => ({ ...track, armed: false })), next] : [...current, next]);
    setSelectedTrackId(next.id);
    setStatus(`Created ${kind} track`);
    return next;
  }

  function armTrack(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.kind === "audio" && track.id === id })));
    setSelectedTrackId(id);
    setStatus("Record target armed");
  }

  function ensureRecordingTarget() {
    const existing = tracks.find((track) => track.kind === "audio" && track.armed) ?? tracks.find((track) => track.kind === "audio");
    if (existing) {
      if (!existing.armed) armTrack(existing.id);
      return existing;
    }
    return createTrack("audio", true);
  }

  async function startInputMeter() {
    if (streamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = getAudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let max = 0;
      for (const value of data) max = Math.max(max, Math.abs(value - 128) / 128);
      setInputMeter(Math.min(100, Math.round(max * 160)));
      meterRef.current = requestAnimationFrame(tick);
    };
    tick();
    setStatus("Input meter armed");
  }

  async function startRecording() {
    const target = ensureRecordingTarget();
    if (!target) return setStatus("Could not create recording target");
    await startInputMeter();
    await countIn();
    const stream = streamRef.current;
    if (!stream) return setStatus("No microphone stream available");
    recordingChunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recordStartRef.current = playhead;
    recorder.ondataavailable = (event) => {
      if (event.data.size) recordingChunksRef.current.push(event.data);
    };
    recorder.onstop = () => void finishRecording(target.id);
    recorder.start();
    setIsRecording(true);
    setStatus(`Recording ${target.name}`);
    void play(false);
  }

  async function finishRecording(trackId: string) {
    const blob = new Blob(recordingChunksRef.current, { type: recorderRef.current?.mimeType || "audio/webm" });
    if (!blob.size) {
      setStatus("Recording produced no audio");
      setIsRecording(false);
      return;
    }
    const decoded = await decodeBlob(blob);
    const target = tracks.find((track) => track.id === trackId) ?? tracks.find((track) => track.kind === "audio");
    if (!target) return;
    let start = recordStartRef.current;
    if (protectOverwrite) {
      const collision = target.clips.some((clip) => overlap(start, decoded.duration, clip));
      if (collision) {
        start = Math.max(start, ...target.clips.map((clip) => clip.start + visibleDuration(clip))) + 0.1;
        setStatus("Overwrite protected: recorded take moved after existing clips");
      }
    }
    const lane = 1 + target.clips.filter((clip) => clip.source === "recording").length;
    const takeName = `Vocal Take ${String(recordTake).padStart(2, "0")}`;
    const clip: Clip = {
      id: uid("clip"),
      name: takeName,
      url: URL.createObjectURL(blob),
      type: blob.type,
      duration: decoded.duration,
      start,
      color: target.color,
      peaks: decoded.peaks,
      takeLane: lane,
      source: "recording",
    };
    setRecordTake((value) => value + 1);
    setSelectedClipId(clip.id);
    setSelectedTrackId(target.id);
    setTracks((current) => current.map((track) => track.id === target.id ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
    setIsRecording(false);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setIsRecording(false);
    stop();
  }

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) return setStatus("Choose a real audio file");
    const target = selectedTrack?.kind === "audio" ? selectedTrack : ensureRecordingTarget();
    if (!target) return;
    setStatus("Analyzing waveform peaks...");
    for (const file of audioFiles) {
      const decoded = await decodeBlob(file);
      const clip: Clip = {
        id: uid("clip"),
        name: file.name.replace(/\.[a-z0-9]+$/i, ""),
        url: URL.createObjectURL(file),
        type: file.type || "audio/*",
        duration: decoded.duration,
        start: playhead,
        color: target.color,
        peaks: decoded.peaks,
        takeLane: 0,
        source: "import",
      };
      setTracks((current) => current.map((track) => track.id === target.id ? { ...track, clips: [...track.clips, clip].sort((a, b) => a.start - b.start) } : track));
      setSelectedClipId(clip.id);
      setSelectedTrackId(target.id);
    }
    setStatus("Imported audio with accurate peaks");
  }

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track));
  }

  function deleteTrack(id: string) {
    setTracks((current) => current.filter((track) => track.id !== id));
    if (selectedTrackId === id) setSelectedTrackId(null);
  }

  const recordTarget = armedTrack?.name ?? "Auto-create audio track";

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden bg-[#101319] text-white">
      <header className="border-b border-black bg-[linear-gradient(180deg,#2b3038,#171b21)] px-3 py-3">
        <div className="grid gap-3 rounded-2xl border border-white/10 bg-black/45 p-3 xl:grid-cols-[1fr_300px]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded bg-cyan-300/15 px-3 py-2 font-mono text-cyan-100">{formatTime(playhead)}</span>
              <button onClick={() => { stop(); setPlayhead(0); }} className="rounded-xl bg-[#222832] px-3 py-3 text-white/70">|◀</button>
              <button onClick={() => setPlayhead((value) => Math.max(0, value - 5))} className="rounded-xl bg-[#222832] px-3 py-3 text-white/70">◀◀</button>
              <button onClick={() => isPlaying ? stop() : void play(false)} className={cn("rounded-xl px-6 py-3 text-black", isPlaying ? "bg-red-500" : "bg-green-400")}>{isPlaying ? "Stop" : "Play"}</button>
              <button onClick={() => void play(true)} disabled={isPlaying || isRecording} className="rounded-xl bg-yellow-300 px-4 py-3 text-black disabled:opacity-40">Count-In Play</button>
              <button onClick={() => isRecording ? stopRecording() : void startRecording()} className={cn("rounded-xl px-6 py-3 text-black", isRecording ? "bg-red-600 animate-pulse" : "bg-red-400")}>{isRecording ? "Stop Rec" : "Record"}</button>
              <button onClick={() => setPlayhead((value) => Math.min(sessionEnd, value + 5))} className="rounded-xl bg-[#222832] px-3 py-3 text-white/70">▶▶</button>
              <button onClick={() => setMetronomeEnabled((value) => !value)} className={cn("rounded-xl px-4 py-3", metronomeEnabled ? "bg-cyan-300 text-black" : "bg-[#222832] text-white/70")}>Click</button>
            </div>
            {countInDisplay && <div className="mt-3 rounded-2xl border border-yellow-300/40 bg-yellow-300/15 p-4 text-center text-3xl font-black uppercase tracking-[0.35em] text-yellow-100">Count {countInDisplay}</div>}
          </div>
          <aside className="grid gap-2 text-[10px] font-black uppercase tracking-widest sm:grid-cols-2">
            <label className="rounded-xl bg-[#11161d] p-2 text-white/45">BPM<input type="number" min="40" max="260" value={bpm} onChange={(event) => setBpm(Math.max(40, Math.min(260, Number(event.target.value) || 120)))} className="mt-1 w-full bg-black p-1 text-cyan-100" /></label>
            <label className="rounded-xl bg-[#11161d] p-2 text-white/45">Stop<select value={stopMode} onChange={(event) => setStopMode(event.target.value as StopMode)} className="mt-1 w-full bg-black p-1 text-cyan-100"><option value="pause">Pause</option><option value="return">Return</option></select></label>
            <label className="rounded-xl bg-[#11161d] p-2 text-white/45">Count<input type="number" min="0" max="8" value={countInBeats} onChange={(event) => setCountInBeats(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full bg-black p-1 text-cyan-100" /></label>
            <label className="rounded-xl bg-[#11161d] p-2 text-white/45">Target<input value={recordTarget} readOnly className="mt-1 w-full bg-black p-1 text-red-200" /></label>
          </aside>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/65">
          <span className="mr-auto text-cyan-200">Main DAW · Record Ready</span>
          <button onClick={() => createTrack("audio", true)} className="rounded-lg bg-cyan-300 px-3 py-2 text-black">Add Audio</button>
          <button onClick={() => createTrack("aux")} className="rounded-lg bg-[#343a44] px-3 py-2 text-white/80">Add Aux</button>
          <button onClick={() => createTrack("master")} className="rounded-lg bg-[#d8d2bd] px-3 py-2 text-black">Add Master</button>
          <button onClick={() => void startInputMeter()} className="rounded-lg bg-black/55 px-3 py-2 text-cyan-100">Input Meter</button>
          <label className="cursor-pointer rounded-lg bg-[#303743] px-3 py-2 text-cyan-100">Import<input type="file" multiple accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac,.aif,.aiff,.mp4" className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label>
          <label className="flex items-center gap-2 rounded-lg bg-black/55 px-3 py-2"><input type="checkbox" checked={protectOverwrite} onChange={(event) => setProtectOverwrite(event.target.checked)} className="accent-cyan-300" /> Protect Overwrite</label>
          <span className="rounded-lg bg-black/55 px-3 py-2 text-white/65">Input {inputMeter}%</span>
          <span className="h-5 w-28 rounded-full bg-black"><span className={cn("block h-full rounded-full", inputMeter > 85 ? "bg-red-500" : inputMeter > 45 ? "bg-yellow-300" : "bg-green-400")} style={{ width: `${inputMeter}%` }} /></span>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[270px_1fr_280px] overflow-hidden max-lg:grid-cols-[220px_1fr] max-md:grid-cols-1">
        <aside className="min-h-0 overflow-auto border-r border-black bg-[#1b2028] max-md:max-h-[34svh] max-md:border-b max-md:border-r-0">
          <div className="sticky top-0 z-10 border-b border-black bg-[#252b34] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45">Tracks</div>
          {tracks.map((track) => (
            <article key={track.id} onClick={() => setSelectedTrackId(track.id)} className={cn("border-b border-black bg-[linear-gradient(180deg,#252a33,#1a1f27)] p-3", selectedTrack?.id === track.id && "ring-1 ring-cyan-300/70")}>
              <div className="flex items-center gap-3">
                <span className="h-12 w-2 rounded-full" style={{ backgroundColor: track.color }} />
                <div className="min-w-0 flex-1"><input value={track.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="w-full rounded-lg border border-white/10 bg-black/55 px-2 py-2 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-cyan-300" /><p className="mt-1 text-[9px] uppercase tracking-widest text-white/35">{track.kind} · {track.clips.length} clips</p></div>
                <button onClick={(event) => { event.stopPropagation(); deleteTrack(track.id); }} className="rounded-lg bg-red-500 px-3 py-2 text-[9px] font-black uppercase text-black">Del</button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest"><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { muted: !track.muted }); }} className={cn("min-h-9 rounded-lg border", track.muted ? "border-yellow-200 bg-yellow-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Mute</button><button onClick={(event) => { event.stopPropagation(); updateTrack(track.id, { solo: !track.solo }); }} className={cn("min-h-9 rounded-lg border", track.solo ? "border-cyan-200 bg-cyan-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Solo</button><button disabled={track.kind !== "audio"} onClick={(event) => { event.stopPropagation(); armTrack(track.id); }} className={cn("min-h-9 rounded-lg border disabled:opacity-35", track.armed ? "border-red-200 bg-red-500 text-black" : "border-white/10 bg-black/55 text-white/55")}>Rec</button></div>
            </article>
          ))}
        </aside>

        <section className="grid min-h-0 grid-rows-[38px_auto_1fr_36px] overflow-hidden bg-[#10141a]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
          <div className="relative border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}>{ticks.map((tick) => <button key={tick} onClick={() => setPlayhead(tick)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: tick * zoom, width: Math.max(40, (rulerMode === "bars" ? beatSeconds : 1) * zoom) }}>{formatRuler(tick, rulerMode, bpm)}</button>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} /></div>
          <div className="flex items-center gap-3 border-b border-black bg-black/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45"><span>Ruler</span>{(["bars", "time", "samples", "timecode"] as RulerMode[]).map((mode) => <button key={mode} onClick={() => setRulerMode(mode)} className={cn("rounded-full px-2 py-1", rulerMode === mode ? "bg-cyan-300 text-black" : "bg-[#222832]")}>{mode}</button>)}<span>BPM grid updates bars/beats · wave {waveZoom.toFixed(2)}x</span><input type="range" min="0.35" max="4" step="0.05" value={waveZoom} onChange={(event) => setWaveZoom(Number(event.target.value))} className="max-w-xs flex-1 accent-yellow-300" /></div>
          <div className="overflow-auto"><div className="relative" style={{ width: timelineWidth }}>{tracks.map((track) => <div key={track.id} data-track-id={track.id} className="relative h-[104px] border-b border-black bg-[#151a22]"><div className="absolute inset-0">{ticks.map((tick) => <span key={tick} className="absolute bottom-0 top-0 border-r border-cyan-300/20" style={{ left: tick * zoom, width: Math.max(40, (rulerMode === "bars" ? beatSeconds : 1) * zoom) }} />)}</div>{track.armed && <div className="absolute inset-0 bg-red-500/[0.07]" />}{track.muted && <div className="pointer-events-none absolute inset-0 z-10 bg-black/35" />}{track.clips.map((clip) => <button key={clip.id} onClick={() => { setSelectedClipId(clip.id); setSelectedTrackId(track.id); }} className={cn("absolute rounded-xl border px-3 text-left shadow-inner", selectedClipId === clip.id ? "z-20 ring-2 ring-cyan-100" : "z-10")} style={{ left: clip.start * zoom, top: `${8 + clip.takeLane * 18}px`, width: Math.max(96, visibleDuration(clip) * zoom), height: clip.takeLane ? 74 : 82, borderColor: clip.color, backgroundColor: `${clip.color}2b` }}><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: clip.color }}>{clip.source === "recording" ? `Lane ${clip.takeLane} · ` : ""}{clip.name}</b><Wave peaks={clip.peaks} color={clip.color} zoom={waveZoom} /><span className="absolute bottom-1 left-3 text-[9px] uppercase text-white/45">{formatRuler(clip.start, rulerMode, bpm)} · {formatTime(visibleDuration(clip))}</span></button>)}</div>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} /></div></div>
          <input type="range" min={0} max={sessionEnd} step={0.01} value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-full accent-cyan-300" />
        </section>

        <aside className="min-h-0 overflow-auto border-l border-black bg-[#20242b] p-3 text-xs text-white/60 max-lg:hidden"><h2 className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Takes / Inspector</h2><div className="mt-3 max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/35">{allClips.length === 0 ? <p className="p-3 text-white/40">No clips yet.</p> : allClips.map(({ track, clip }) => <button key={clip.id} onClick={() => { setSelectedTrackId(track.id); setSelectedClipId(clip.id); setPlayhead(clip.start); }} className={cn("block w-full border-b border-white/5 p-3 text-left", selectedClipId === clip.id ? "bg-cyan-300/20 text-cyan-100" : "hover:bg-white/5")}><b className="block truncate uppercase" style={{ color: clip.color }}>{clip.name}</b><span className="font-mono text-[10px] text-white/45">{track.name} · lane {clip.takeLane || 0} · {formatRuler(clip.start, rulerMode, bpm)}</span></button>)}</div>{selectedClip && <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3"><b className="block truncate uppercase text-white/70">{selectedClip.name}</b><p className="mt-2 text-white/45">Source: {selectedClip.source}. Take lane: {selectedClip.takeLane || 0}. Overwrite protection: {protectOverwrite ? "on" : "off"}.</p></div>}</aside>
      </section>

      <footer className="flex items-center gap-3 border-t border-black bg-[#15171b] px-3 py-1 text-[10px] uppercase tracking-widest text-white/45"><span>{status}</span><span className="ml-auto">BPM {bpm} · target {recordTarget} · {isRecording ? "recording" : isPlaying ? "playing" : "stopped"} · take {recordTake}</span></footer>
    </main>
  );
}
