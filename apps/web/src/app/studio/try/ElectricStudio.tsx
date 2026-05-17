"use client";

import { useEffect, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type Mode = "edit" | "beat" | "mix" | "export";
type Clip = { name: string; url: string; type: string; size: number; duration: number; peaks: number[] };
type Track = { id: string; name: string; color: string; armed: boolean; muted: boolean; solo: boolean; volume: number; pan: number; inputGain: number; clip: Clip };

const colors = ["#65d6ff", "#a78bfa", "#f9d66a", "#42e89d", "#ff7adf", "#ff9f6e"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function cleanName(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, " ").trim() || "Audio Track";
}

function fileSlug(value: string) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "audio";
}

async function decodeAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const data = buffer.getChannelData(0);
  const count = 320;
  const block = Math.max(1, Math.floor(data.length / count));
  const peaks = Array.from({ length: count }, (_, i) => {
    let max = 0;
    const end = Math.min(data.length, i * block + block);
    for (let s = i * block; s < end; s += 1) max = Math.max(max, Math.abs(data[s] ?? 0));
    return max;
  });
  return { duration: buffer.duration, peaks };
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<Mode>("edit");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [barsBeats, setBarsBeats] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const players = useRef<HTMLAudioElement[]>([]);
  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;
  const armed = tracks.find((track) => track.armed) ?? selected;

  useEffect(() => () => {
    tracks.forEach((track) => URL.revokeObjectURL(track.clip.url));
    players.current.forEach((audio) => audio.pause());
  }, []);

  async function importFiles(files: FileList | File[]) {
    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || /\.(wav|mp3|m4a|aac|ogg|webm|flac)$/i.test(file.name));
    if (!audioFiles.length) {
      setError("Choose a real audio file: WAV, MP3, M4A, AAC, OGG, WEBM, or FLAC.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of audioFiles) {
        const decoded = await decodeAudio(file);
        const id = `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const url = URL.createObjectURL(file);
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
          clip: { name: file.name, url, type: file.type || "audio", size: file.size, duration: decoded.duration, peaks: decoded.peaks },
        };
        setTracks((current) => [...current, track]);
        setSelectedId(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audio could not be decoded.");
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    players.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    players.current = [];
    setPlaying(false);
  }

  function play() {
    if (playing) return stop();
    const audible = tracks.filter((track) => !track.muted);
    if (!audible.length) return;
    players.current = audible.map((track) => {
      const audio = new Audio(track.clip.url);
      audio.volume = Math.min(1, Math.max(0, track.volume / 100));
      void audio.play();
      return audio;
    });
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), Math.max(...audible.map((track) => track.clip.duration)) * 1000 + 250);
  }

  function arm(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.id === id })));
    setSelectedId(id);
  }

  function update(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, ...patch } : track));
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#111316] text-[#d8d8d8]">
      <div className="grid h-full grid-rows-[34px_54px_1fr]">
        <div className="flex items-center border-b border-black bg-[#26282c] text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
          <button onClick={() => setMode("edit")} className="h-full border-r border-black px-4 text-cyan-200">EMS Studio</button>
          {(["edit", "mix", "beat", "export"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("h-full border-r border-black px-5", mode === item ? "bg-[#d8d2bd] text-black" : "bg-[#303238] text-white/72 hover:bg-[#3b3e45]")}>{item}</button>)}
          <div className="ml-auto flex h-full items-center gap-2 px-3">
            <span>Counter</span><span className="min-w-[96px] bg-black px-3 py-1 font-mono text-green-300">001|01|000</span>
            <button onClick={() => setBarsBeats((value) => !value)} className="bg-[#1a1c20] px-3 py-1 text-white/70">{barsBeats ? "Bars|Beats" : "Min:Sec"}</button>
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-black bg-[#1d2025] px-3 text-[11px] uppercase tracking-widest text-white/70">
          <button onClick={play} disabled={!tracks.length} className={cn("h-8 min-w-16 border border-black px-4 font-black disabled:opacity-35", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
          <label className="flex h-8 cursor-pointer items-center border border-black bg-[#353941] px-4 font-black text-cyan-100">{busy ? "Importing" : "Import Audio"}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label>
          <span className="border border-black bg-[#121417] px-3 py-2">Rec Target: <b className="text-red-300">{armed?.name ?? "none"}</b></span>
          <label className="border border-black bg-[#121417] px-3 py-2">BPM <input value={bpm} onChange={(event) => setBpm(Number(event.target.value) || 92)} className="ml-2 w-14 bg-black px-1 font-mono text-green-300 outline-none" /></label>
          <div className="ml-auto text-white/45">Clean DAW workspace: no cards, no fake clips, real decoded audio only</div>
        </div>

        {error && <div className="absolute left-3 right-3 top-[92px] z-40 border border-red-400/50 bg-red-950 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}

        <main className="min-h-0 overflow-hidden bg-[#171a1f]">
          {mode === "beat" && <BeatMachineProClient studioMode />}
          {mode === "edit" && <EditWorkspace tracks={tracks} selected={selected} setSelectedId={setSelectedId} importFiles={importFiles} update={update} arm={arm} />}
          {mode === "mix" && <MixerWorkspace tracks={tracks} selected={selected} update={update} arm={arm} />}
          {mode === "export" && <ExportWorkspace tracks={tracks} selected={selected} />}
        </main>
      </div>
    </div>
  );
}

function EditWorkspace({ tracks, selected, setSelectedId, importFiles, update, arm }: { tracks: Track[]; selected: Track | null; setSelectedId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr] bg-[#1b1f26]">
      <div className="grid min-h-0 grid-rows-[42px_1fr] border-r border-black bg-[#252930]">
        <div className="flex items-center border-b border-black bg-[#30343b] px-3 text-[10px] font-black uppercase tracking-widest text-white/55">Tracks</div>
        <div className="overflow-auto">
          {tracks.length === 0 && <div className="px-3 py-4 text-xs leading-5 text-white/45">No tracks loaded.</div>}
          {tracks.map((track) => <button key={track.id} onClick={() => setSelectedId(track.id)} className={cn("grid h-[86px] w-full grid-cols-[8px_1fr_66px] border-b border-black text-left", selected?.id === track.id ? "bg-[#3a3d45]" : "bg-[#282c33]")}><span style={{ backgroundColor: track.color }} /><span className="min-w-0 px-3 py-2"><b className="block truncate text-[12px] uppercase text-white/85">{track.name}</b><span className="mt-1 block text-[10px] uppercase tracking-wide text-white/40">{track.clip.duration.toFixed(1)}s · {Math.round(track.clip.size / 1024)} KB</span><span className="mt-2 block h-2 bg-black"><span className="block h-full bg-green-400" style={{ width: `${track.volume}%` }} /></span></span><span className="grid grid-cols-2 gap-px p-2 text-[9px] font-black uppercase"><button onClick={(event) => { event.stopPropagation(); update(track.id, { muted: !track.muted }); }} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>M</button><button onClick={(event) => { event.stopPropagation(); update(track.id, { solo: !track.solo }); }} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>S</button><button onClick={(event) => { event.stopPropagation(); arm(track.id); }} className={track.armed ? "col-span-2 bg-red-500 text-black" : "col-span-2 bg-[#15171b] text-white/45"}>Rec</button></span></button>)}
        </div>
      </div>

      <section className="grid min-h-0 grid-rows-[42px_1fr] overflow-hidden bg-[#171a1f]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>
        <div className="grid grid-cols-[repeat(24,90px)] overflow-hidden border-b border-black bg-[#30343b] text-[10px] font-black uppercase text-white/45">
          {Array.from({ length: 24 }, (_, i) => <div key={i} className="border-r border-black px-2 py-3 font-mono">{String(i + 1).padStart(2, "0")}</div>)}
        </div>
        {tracks.length === 0 ? <div className="grid h-full place-items-center bg-[#171a1f]"><div className="text-center"><h2 className="text-2xl font-black uppercase tracking-widest text-cyan-100">Edit Window</h2><p className="mt-3 text-sm text-white/50">Import or drop real audio. Waveforms render from decoded audio only.</p><label className="mt-5 inline-block cursor-pointer bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black">Import Audio<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label></div></div> : <div className="overflow-auto"><div className="min-w-[2160px]">{tracks.map((track) => <div key={track.id} className="relative h-[86px] border-b border-black bg-[#1b1f26]"><div className="absolute inset-0 grid grid-cols-[repeat(24,90px)]">{Array.from({ length: 24 }, (_, i) => <span key={i} className="border-r border-black/80" />)}</div>{track.armed && <div className="absolute inset-0 bg-red-500/[0.045]" />}<button onClick={() => setSelectedId(track.id)} className="absolute left-0 top-[10px] h-[66px] border px-3 text-left shadow-inner" style={{ width: `${Math.max(220, track.clip.duration * 92)}px`, borderColor: track.color, backgroundColor: `${track.color}24` }}><b className="block truncate text-[11px] uppercase tracking-wide" style={{ color: track.color }}>{track.clip.name}</b><Wave peaks={track.clip.peaks} color={track.color} /></button></div>)}</div></div>}
      </section>
    </div>
  );
}

function Wave({ peaks, color }: { peaks: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    const center = canvas.height / 2;
    const step = canvas.width / peaks.length;
    peaks.forEach((peak, index) => {
      const height = Math.max(1, peak * canvas.height);
      ctx.globalAlpha = 0.86;
      ctx.fillRect(index * step, center - height / 2, Math.max(1, step * 0.7), height);
    });
  }, [peaks, color]);
  return <canvas ref={ref} width={620} height={38} className="mt-2 h-9 w-full bg-black/20" aria-label="Decoded audio waveform" />;
}

function MixerWorkspace({ tracks, selected, update, arm }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void }) {
  if (!tracks.length) return <div className="grid h-full place-items-center bg-[#20242b] text-white/55">Import audio in Edit first.</div>;
  return (
    <div className="h-full overflow-auto bg-[#20242b] p-0">
      <div className="flex min-h-full min-w-max items-stretch border-l border-black">
        {tracks.map((track, index) => {
          const clipping = track.volume + track.inputGain >= 154;
          return <div key={track.id} className="grid w-[118px] grid-rows-[40px_82px_74px_1fr_58px] border-r border-black bg-[#2d3138] text-center">
            <div className="flex items-center justify-center border-b border-black bg-[#3a3f47] text-[10px] font-black uppercase tracking-widest" style={{ color: track.color }}>Ch {index + 1}</div>
            <div className="border-b border-black p-2"><b className="block truncate text-[11px] uppercase text-white/80">{track.name}</b><span className="mt-1 block truncate text-[9px] text-white/35">{track.clip.name}</span><button onClick={() => arm(track.id)} className={cn("mt-2 w-full py-1 text-[9px] font-black uppercase", track.armed ? "bg-red-500 text-black" : "bg-[#15171b] text-white/45")}>Rec</button></div>
            <div className="grid grid-cols-2 gap-px border-b border-black p-2 text-[9px] font-black uppercase"><button onClick={() => update(track.id, { muted: !track.muted })} className={track.muted ? "bg-yellow-300 text-black" : "bg-[#15171b] text-white/45"}>Mute</button><button onClick={() => update(track.id, { solo: !track.solo })} className={track.solo ? "bg-cyan-300 text-black" : "bg-[#15171b] text-white/45"}>Solo</button><label className="col-span-2 mt-2 text-white/40">Pan<input type="range" min="-50" max="50" value={track.pan} onChange={(event) => update(track.id, { pan: Number(event.target.value) })} className="w-full accent-cyan-300" /></label></div>
            <div className="grid grid-cols-[22px_1fr] gap-2 border-b border-black p-3"><div className="relative bg-black"><span className={cn("absolute bottom-0 left-0 right-0", clipping ? "bg-red-500" : "bg-green-400")} style={{ height: `${Math.min(100, track.volume + track.inputGain / 4)}%` }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) })} className="h-full w-12 accent-[#d8d2bd] [writing-mode:vertical-lr]" /></div>
            <div className="flex items-center justify-center bg-[#181b20] font-mono text-sm text-[#d8d2bd]">{track.volume.toString().padStart(2, "0")}</div>
          </div>;
        })}
      </div>
      <div className="fixed bottom-0 left-0 right-0 hidden h-10 border-t border-black bg-[#15171b] px-4 text-xs text-white/45 md:flex md:items-center">Mixer: console-style channel strips, meters, faders, pan, mute, solo, and record-arm. Selected: {selected?.name ?? "none"}</div>
    </div>
  );
}

function ExportWorkspace({ tracks, selected }: { tracks: Track[]; selected: Track | null }) {
  function download(track: Track) {
    const a = document.createElement("a");
    a.href = track.clip.url;
    a.download = `${fileSlug(track.name)}.${track.clip.name.split(".").pop() || "audio"}`;
    a.click();
  }
  return <div className="grid h-full place-items-center bg-[#20242b] p-6"><div className="text-center"><h2 className="text-3xl font-black uppercase tracking-widest text-cyan-100">Export</h2><p className="mt-3 text-sm text-white/55">Downloads real source audio from this session.</p><button disabled={!selected} onClick={() => selected && download(selected)} className="mt-5 bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download Selected</button><button disabled={!tracks.length} onClick={() => tracks.forEach(download)} className="ml-3 mt-5 border border-white/20 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download Stems</button></div></div>;
}
