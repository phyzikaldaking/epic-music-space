"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type Mode = "edit" | "mix" | "beat" | "export";
type Clip = { name: string; url: string; type: string; size: number; duration: number; peaks: number[]; start: number };
type Track = { id: string; name: string; color: string; armed: boolean; muted: boolean; solo: boolean; volume: number; pan: number; inputGain: number; clip: Clip };

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e", "#8ee3f5"];
const audioNamePattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [zoom, setZoom] = useState(110);
  const [playhead, setPlayhead] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<HTMLAudioElement[]>([]);
  const playStart = useRef(0);
  const timer = useRef<number | null>(null);
  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;
  const armed = tracks.find((track) => track.armed) ?? selected;
  const sessionEnd = Math.max(10, ...tracks.map((track) => track.clip.start + track.clip.duration));

  useEffect(() => () => {
    tracks.forEach((track) => URL.revokeObjectURL(track.clip.url));
    stopTransport();
  }, []);

  function clearTimer() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  async function importFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const audioFiles = incoming.filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioNamePattern.test(file.name));
    if (!audioFiles.length) {
      setError("That file type was not accepted. Use WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of audioFiles) {
        const decoded = await decodeAudio(file);
        const id = `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const index = tracks.length + audioFiles.indexOf(file);
        const track: Track = {
          id,
          name: cleanName(file.name),
          color: colors[index % colors.length],
          armed: tracks.length === 0 && audioFiles.indexOf(file) === 0,
          muted: false,
          solo: false,
          volume: 78,
          pan: 0,
          inputGain: 60,
          clip: { name: file.name, url: URL.createObjectURL(file), type: file.type || "audio", size: file.size, duration: decoded.duration, peaks: decoded.peaks, start: 0 },
        };
        setTracks((current) => [...current, track]);
        setSelectedId(id);
      }
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
    const audible = tracks.filter((track) => !track.muted && playhead < track.clip.start + track.clip.duration);
    if (!audible.length) return;
    const nowStart = performance.now() / 1000 - playhead;
    playStart.current = nowStart;
    players.current = audible.map((track) => {
      const audio = new Audio(track.clip.url);
      audio.volume = Math.min(1, Math.max(0, track.volume / 100));
      audio.currentTime = Math.max(0, playhead - track.clip.start);
      const wait = Math.max(0, track.clip.start - playhead) * 1000;
      window.setTimeout(() => { void audio.play().catch((err) => setError(err instanceof Error ? err.message : "Playback failed.")); }, wait);
      return audio;
    });
    setPlaying(true);
    timer.current = window.setInterval(() => {
      const next = performance.now() / 1000 - playStart.current;
      setPlayhead(next);
      if (next >= sessionEnd) stopTransport();
    }, 40);
  }

  function arm(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.id === id })));
    setSelectedId(id);
  }

  function update(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch, clip: patch.clip ?? track.clip } : track));
  }

  function zoomIn() { setZoom((value) => Math.min(420, value + 30)); }
  function zoomOut() { setZoom((value) => Math.max(35, value - 30)); }
  function zoomFit() { setZoom(Math.max(45, Math.min(160, 1200 / sessionEnd))); }

  return <div className="h-dvh overflow-hidden bg-[#111316] text-[#d8d8d8]"><div className="grid h-full grid-rows-[34px_58px_1fr]">
    <div className="flex items-center border-b border-black bg-[#26282c] text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"><button onClick={() => setMode("edit")} className="h-full border-r border-black px-4 text-cyan-200">EMS Studio</button>{(["edit", "mix", "beat", "export"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("h-full border-r border-black px-5", mode === item ? "bg-[#d8d2bd] text-black" : "bg-[#303238] text-white/72 hover:bg-[#3b3e45]")}>{item}</button>)}<div className="ml-auto flex h-full items-center gap-2 px-3"><span>Counter</span><span className="min-w-[96px] bg-black px-3 py-1 font-mono text-green-300">{formatTime(playhead)}</span></div></div>
    <div className="flex items-center gap-2 border-b border-black bg-[#1d2025] px-3 text-[11px] uppercase tracking-widest text-white/70"><button onClick={() => { stopTransport(true); }} className="h-8 border border-black bg-[#30343b] px-3 font-black">|&lt;</button><button onClick={() => stopTransport()} className="h-8 border border-black bg-[#30343b] px-4 font-black">Stop</button><button onClick={playing ? () => stopTransport() : playTransport} disabled={!tracks.length} className={cn("h-8 min-w-16 border border-black px-4 font-black disabled:opacity-35", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Pause" : "Play"}</button><button onClick={() => armed && arm(armed.id)} className="h-8 border border-black bg-red-500/80 px-4 font-black text-black">Rec</button><label className="flex h-8 cursor-pointer items-center border border-black bg-[#353941] px-4 font-black text-cyan-100">{busy ? "Importing" : "Import Audio"}<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label><button onClick={zoomOut} className="h-8 border border-black bg-[#30343b] px-3 font-black">Zoom -</button><button onClick={zoomIn} className="h-8 border border-black bg-[#30343b] px-3 font-black">Zoom +</button><button onClick={zoomFit} className="h-8 border border-black bg-[#30343b] px-3 font-black">Fit</button><label className="border border-black bg-[#121417] px-3 py-2">BPM <input value={bpm} onChange={(event) => setBpm(Number(event.target.value) || 92)} className="ml-2 w-14 bg-black px-1 font-mono text-green-300 outline-none" /></label><span className="ml-auto border border-black bg-[#121417] px-3 py-2">File: <b className="text-cyan-200">{selected?.clip.name ?? "none"}</b></span></div>
    {error && <div className="absolute left-3 right-3 top-[96px] z-40 border border-red-400/50 bg-red-950 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}
    <main className="min-h-0 overflow-hidden bg-[#171a1f]">{mode === "beat" && <BeatMachineProClient studioMode />}{mode === "edit" && <EditWorkspace tracks={tracks} selected={selected} setSelectedId={setSelectedId} importFiles={importFiles} update={update} arm={arm} zoom={zoom} playhead={playhead} setPlayhead={setPlayhead} sessionEnd={sessionEnd} />}{mode === "mix" && <MixerWorkspace tracks={tracks} selected={selected} update={update} arm={arm} />}{mode === "export" && <ExportWorkspace tracks={tracks} selected={selected} />}</main>
  </div></div>;
}

function EditWorkspace({ tracks, selected, setSelectedId, importFiles, update, arm, zoom, playhead, setPlayhead, sessionEnd }: { tracks: Track[]; selected: Track | null; setSelectedId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void; zoom: number; playhead: number; setPlayhead: (seconds: number) => void; sessionEnd: number }) {
  const seconds = useMemo(() => Array.from({ length: Math.ceil(sessionEnd) + 1 }, (_, i) => i), [sessionEnd]);
  const timelineWidth = Math.max(1600, sessionEnd * zoom + 480);
  return <div className="grid h-full min-h-0 grid-cols-[270px_1fr] bg-[#1b1f26]"><div className="grid min-h-0 grid-rows-[42px_1fr_210px] border-r border-black bg-[#252930]"><div className="flex items-center border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55">Tracks</div><div className="overflow-auto">{tracks.length === 0 && <div className="px-3 py-4 text-xs leading-5 text-white/45">No tracks loaded.</div>}{tracks.map((track) => <button key={track.id} onClick={() => setSelectedId(track.id)} className={cn("grid h-[86px] w-full grid-cols-[8px_1fr_74px] border-b border-black text-left", selected?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]")}><span style={{ backgroundColor: track.color }} /><span className="min-w-0 px-3 py-2"><b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b><span className="mt-1 block text-[10px] uppercase tracking-wide text-white/40">{track.clip.duration.toFixed(2)}s · {Math.round(track.clip.size / 1024)} KB</span><span className="mt-2 block h-2 bg-black"><span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} /></span></span><span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase"><button onClick={(event) => { event.stopPropagation(); update(track.id, { muted: !track.muted }); }} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>M</button><button onClick={(event) => { event.stopPropagation(); update(track.id, { solo: !track.solo }); }} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>S</button><button onClick={(event) => { event.stopPropagation(); arm(track.id); }} className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45"}>Rec</button></span></button>)}</div><Inspector track={selected} update={update} arm={arm} /></div><section className="grid min-h-0 grid-rows-[42px_1fr_34px] overflow-hidden bg-[#171a1f]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}><div className="relative overflow-hidden border-b border-black bg-[#30343b]" style={{ width: timelineWidth }}><div className="absolute bottom-0 top-0 w-px bg-cyan-300" style={{ left: playhead * zoom }} />{seconds.map((second) => <button key={second} onClick={() => setPlayhead(second)} className="absolute bottom-0 top-0 border-r border-black/80 px-1 text-left font-mono text-[10px] text-white/50" style={{ left: second * zoom, width: zoom }}>{second % 2 === 0 ? formatTime(second) : second}</button>)}</div>{tracks.length === 0 ? <div className="grid h-full place-items-center bg-[#171a1f]"><div className="text-center"><h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2><p className="mt-3 text-sm text-white/50">Import or drop real audio. Zoom, transport, playhead, and waveform rendering are active.</p><label className="mt-5 inline-block cursor-pointer bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">Import Audio<input type="file" accept="audio/*,.wav,.wave,.mp3,.m4a,.aac,.ogg,.oga,.webm,.flac,.aif,.aiff,.mp4" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label></div></div> : <div className="overflow-auto"><div className="relative" style={{ width: timelineWidth }}>{tracks.map((track) => <div key={track.id} className="relative h-[86px] border-b border-black bg-[#1b1f26]"><div className="absolute inset-0">{seconds.map((second) => <span key={second} className="absolute bottom-0 top-0 border-r border-black/70" style={{ left: second * zoom, width: zoom }} />)}</div>{track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}<button onClick={() => setSelectedId(track.id)} className="absolute top-[10px] h-[66px] border px-3 text-left shadow-inner" style={{ left: track.clip.start * zoom, width: Math.max(180, track.clip.duration * zoom), borderColor: track.color, backgroundColor: `${track.color}24` }}><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: track.color }}>{track.clip.name}</b><Wave peaks={track.clip.peaks} color={track.color} /></button></div>)}<div className="absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_10px_#67e8f9]" style={{ left: playhead * zoom }} /></div></div>}<input type="range" min={0} max={sessionEnd} step={0.01} value={playhead} onChange={(event) => setPlayhead(Number(event.target.value))} className="w-full accent-cyan-300" /></section></div>;
}

function Wave({ peaks, color }: { peaks: number[]; color: string }) {
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
      const visibleCount = Math.max(1, Math.floor(rect.width));
      const step = peaks.length / visibleCount;
      const center = 19;
      for (let x = 0; x < visibleCount; x += 1) {
        const peak = peaks[Math.min(peaks.length - 1, Math.floor(x * step))] ?? 0;
        const height = Math.max(1, peak * 36);
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x, center - height / 2, 1, height);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [peaks, color]);
  return <canvas ref={ref} className="mt-1 block w-full bg-black/20" aria-label="Sharp decoded audio waveform" />;
}

function Inspector({ track, update, arm }: { track: Track | null; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void }) {
  if (!track) return <div className="border-t border-black bg-[#20242b] p-3 text-xs text-white/45">Load audio to inspect track data.</div>;
  const clipping = track.volume + track.inputGain >= 154;
  return <div className="border-t border-black bg-[#20242b] p-3 text-xs"><b className="block truncate uppercase" style={{ color: track.color }}>{track.name}</b><span className="mt-1 block truncate text-white/40">{track.clip.name}</span><div className="mt-2 grid grid-cols-3 gap-1 text-[9px] font-black uppercase"><button onClick={() => update(track.id, { muted: !track.muted })} className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Mute</button><button onClick={() => update(track.id, { solo: !track.solo })} className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Solo</button><button onClick={() => arm(track.id)} className={track.armed ? "bg-red-500 py-1 text-black" : "bg-[#111] py-1 text-white/55"}>Arm</button></div><label className="mt-2 block uppercase text-white/40">Vol {track.volume}<input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) })} className="w-full accent-cyan-300" /></label><label className="mt-2 block uppercase text-white/40">Input {track.inputGain}<input type="range" min="0" max="100" value={track.inputGain} onChange={(event) => update(track.id, { inputGain: Number(event.target.value) })} className="w-full accent-green-300" /></label>{clipping && <button onClick={() => update(track.id, { volume: 72, inputGain: 62 })} className="mt-2 w-full bg-red-500 py-2 font-black uppercase text-black">Fix clipping</button>}</div>;
}

function MixerWorkspace({ tracks, selected, update, arm }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void }) {
  if (!tracks.length) return <div className="grid h-full place-items-center bg-[#20242b] text-white/55">Import audio in Edit first.</div>;
  return <div className="h-full overflow-auto bg-[#20242b]"><div className="flex min-h-full min-w-max items-stretch border-l border-black">{tracks.map((track, index) => <div key={track.id} className="grid w-[124px] grid-rows-[40px_88px_78px_1fr_58px] border-r border-black bg-[#2d3138] text-center"><div className="flex items-center justify-center border-b border-black bg-[#3a3f47] text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>Ch {index + 1}</div><div className="border-b border-black p-2"><b className="block truncate text-[11px] uppercase text-white/80">{track.name}</b><span className="mt-1 block truncate text-[9px] text-white/35">{track.clip.name}</span><button onClick={() => arm(track.id)} className={cn("mt-2 w-full py-1 text-[9px] font-black uppercase", track.armed ? "bg-red-500 text-black" : "bg-[#15171b] text-white/45")}>Rec</button></div><div className="grid grid-cols-2 gap-px border-b border-black p-2 text-[9px] font-black uppercase"><button onClick={() => update(track.id, { muted: !track.muted })} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>Mute</button><button onClick={() => update(track.id, { solo: !track.solo })} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>Solo</button><label className="col-span-2 mt-2 text-white/40">Pan<input type="range" min="-50" max="50" value={track.pan} onChange={(event) => update(track.id, { pan: Number(event.target.value) })} className="w-full accent-cyan-300" /></label></div><div className="grid grid-cols-[22px_1fr] gap-2 border-b border-black p-3"><div className="relative bg-black"><span className={cn("absolute bottom-0 left-0 right-0", track.volume + track.inputGain >= 154 ? "bg-red-500" : "bg-green-400")} style={{ height: `${Math.min(100, track.volume + track.inputGain / 4)}%` }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) })} className="h-full w-12 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div><div className="flex items-center justify-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{track.volume.toString().padStart(2, "0")}</div></div>)}</div><div className="fixed bottom-0 left-0 right-0 hidden h-10 border-t border-black bg-[#15171b] px-4 text-xs text-white/45 md:flex md:items-center">Mixer: console-style channel strips, meters, faders, pan, mute, solo, and record-arm. Selected: {selected?.name ?? "none"}</div></div>;
}

function ExportWorkspace({ tracks, selected }: { tracks: Track[]; selected: Track | null }) {
  function download(track: Track) { const a = document.createElement("a"); a.href = track.clip.url; a.download = `${fileSlug(track.name)}.${clipExt(track.clip)}`; a.click(); }
  return <div className="grid h-full place-items-center bg-[#20242b] p-6"><div className="text-center"><h2 className="text-3xl font-black uppercase tracking-widest text-cyan-100">Export</h2><p className="mt-3 text-sm text-white/55">Downloads real source audio from this session.</p><button disabled={!selected} onClick={() => selected && download(selected)} className="mt-5 bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download Selected</button><button disabled={!tracks.length} onClick={() => tracks.forEach(download)} className="ml-3 mt-5 border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download Stems</button></div></div>;
}
