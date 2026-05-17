"use client";

import { useEffect, useRef, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type Mode = "edit" | "beat" | "mix" | "export";
type Clip = { name: string; url: string; type: string; size: number; duration: number; peaks: number[] };
type Track = { id: string; name: string; color: string; armed: boolean; muted: boolean; volume: number; inputGain: number; clip: Clip };

const colors = ["#ff31df", "#20f7ff", "#f2c85b", "#16e59a", "#a75cff"];

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
  const count = 240;
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
  const [error, setError] = useState<string | null>(null);
  const players = useRef<HTMLAudioElement[]>([]);
  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null;

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
        const track: Track = {
          id,
          name: cleanName(file.name),
          color: colors[tracks.length % colors.length],
          armed: tracks.length === 0,
          muted: false,
          volume: 80,
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
      audio.volume = track.volume / 100;
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

  return <div className="h-dvh overflow-hidden bg-[#05070a] text-white"><div className="flex h-full flex-col gap-2 p-2"><header className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-[#11161c]/95 p-2"><button onClick={() => setMode("edit")} className="rounded-xl border border-white/12 bg-black/35 px-4 py-2 text-left"><span className="block text-xl font-black text-cyan-300">EMS Studio</span><span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Real audio edit surface</span></button><nav className="flex flex-wrap gap-2">{(["edit", "beat", "mix", "export"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={cn("rounded-xl border px-4 py-3 text-[11px] font-black uppercase", mode === item ? "border-cyan-300 bg-cyan-300 text-black" : "border-white/12 bg-white/[0.04] text-white/62")}>{item}</button>)}</nav><div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2"><button onClick={play} disabled={!tracks.length} className={cn("rounded-full px-4 py-2 text-[11px] font-black uppercase disabled:opacity-40", playing ? "bg-red-400 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button><label className="cursor-pointer rounded-full border border-cyan-300/45 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase text-cyan-100">{busy ? "Importing" : "Import audio"}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label><span className="rounded-full border border-red-400/35 bg-red-400/10 px-3 py-2 text-[10px] font-black uppercase text-red-100">Rec target: {tracks.find((track) => track.armed)?.name ?? "none"}</span></div></header>{error && <div className="rounded-xl border border-red-400/35 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div>}<main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/12 bg-[#090d11]">{mode === "beat" && <BeatMachineProClient studioMode />}{mode === "edit" && <Edit tracks={tracks} selected={selected} setSelectedId={setSelectedId} importFiles={importFiles} arm={arm} update={update} />}{mode === "mix" && <Mix tracks={tracks} selected={selected} update={update} />}{mode === "export" && <Export tracks={tracks} selected={selected} />}</main></div></div>;
}

function Edit({ tracks, selected, setSelectedId, importFiles, arm, update }: { tracks: Track[]; selected: Track | null; setSelectedId: (id: string) => void; importFiles: (files: FileList | File[]) => Promise<void>; arm: (id: string) => void; update: (id: string, patch: Partial<Track>) => void }) {
  return <div className="grid h-full grid-cols-[230px_1fr_330px] overflow-hidden"><aside className="overflow-auto border-r border-white/10 bg-[#11161b]"><div className="border-b border-red-400/20 bg-red-400/10 p-3 text-[10px] font-black uppercase tracking-widest text-red-100">Recording to: {tracks.find((track) => track.armed)?.name ?? "none"}</div>{tracks.length === 0 && <div className="p-3 text-xs text-white/45">No audio in this session yet.</div>}{tracks.map((track) => <button key={track.id} onClick={() => setSelectedId(track.id)} className={cn("flex h-[78px] w-full items-center gap-2 border-b border-white/8 p-3 text-left", selected?.id === track.id && "bg-cyan-300/10")}><span className="h-8 w-1 rounded" style={{ backgroundColor: track.color }} /><span className="min-w-0 flex-1"><b className="block truncate text-xs uppercase text-white/82">{track.name}</b><span className="text-[10px] uppercase text-white/35">{track.clip.duration.toFixed(1)}s · {Math.round(track.clip.size / 1024)} KB</span></span><span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.armed ? "bg-red-400 text-black" : "bg-white/8 text-white/40")}>R</span></button>)}</aside><section className="relative overflow-auto bg-[#0d1116] bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px)] bg-[size:100%_78px,90px_100%]" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles(Array.from(event.dataTransfer.files)); }}>{tracks.length === 0 ? <div className="grid h-full place-items-center p-6"><div className="max-w-xl rounded-2xl border border-white/12 bg-black/50 p-6 text-center"><h2 className="text-2xl font-black uppercase text-cyan-100">No audio loaded</h2><p className="mt-3 text-sm leading-6 text-white/55">Import audio or drop files here. The edit screen only draws waveforms decoded from real audio buffers.</p><label className="mt-5 inline-block cursor-pointer rounded-full bg-cyan-300 px-5 py-3 text-xs font-black uppercase text-black">Import audio<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac" multiple className="sr-only" onChange={(event) => event.target.files && void importFiles(event.target.files)} /></label></div></div> : <div className="min-w-[1530px]">{tracks.map((track) => <div key={track.id} className="relative h-[78px] border-b border-white/8">{track.armed && <div className="absolute inset-0 border-y border-red-400/25 bg-red-400/[0.035]" />}<button className="absolute left-0 top-2 h-[calc(100%-16px)] rounded-lg border px-3 text-left" style={{ width: `${Math.max(180, track.clip.duration * 90)}px`, borderColor: track.color, backgroundColor: `${track.color}22` }}><b className="block truncate text-[11px] uppercase" style={{ color: track.color }}>{track.clip.name}</b><Wave peaks={track.clip.peaks} color={track.color} /></button></div>)}</div>}</section><Inspector track={selected} update={update} arm={arm} /></div>;
}

function Wave({ peaks, color }: { peaks: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { const canvas = ref.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = color; const center = canvas.height / 2; const step = canvas.width / peaks.length; peaks.forEach((peak, index) => { const h = Math.max(1, peak * canvas.height); ctx.globalAlpha = 0.85; ctx.fillRect(index * step, center - h / 2, Math.max(1, step * 0.7), h); }); }, [peaks, color]);
  return <canvas ref={ref} width={520} height={34} className="mt-2 h-8 w-full rounded bg-black/20" aria-label="Real decoded audio waveform" />;
}

function Inspector({ track, update, arm }: { track: Track | null; update: (id: string, patch: Partial<Track>) => void; arm: (id: string) => void }) {
  if (!track) return <aside className="overflow-auto border-l border-white/10 bg-[#11161b] p-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Inspector</p><p className="mt-4 text-sm text-white/50">Load real audio to inspect track data.</p></aside>;
  const clipping = track.volume + track.inputGain >= 154;
  return <aside className="overflow-auto border-l border-white/10 bg-[#11161b] p-4"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Inspector</p><h2 className="mt-2 text-2xl font-black uppercase" style={{ color: track.color }}>{track.name}</h2><p className="mt-1 text-[10px] uppercase tracking-widest text-white/35">{track.clip.name} · {track.clip.duration.toFixed(1)}s</p><div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-widest text-red-100">{clipping ? "Clipping warning" : "Headroom safe"}</p><span className={cn("rounded-full px-2 py-1 text-[10px] font-black", clipping ? "bg-red-400 text-black" : "bg-green-400 text-black")}>{clipping ? "hot" : "safe"}</span></div>{clipping && <button onClick={() => update(track.id, { volume: 72, inputGain: 62 })} className="mt-3 rounded-full bg-red-400 px-4 py-2 text-[10px] font-black uppercase text-black">Fix it</button>}</div><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={() => update(track.id, { muted: !track.muted })} className="rounded-lg border border-white/10 py-2 text-xs font-black text-white/55">Mute</button><button className="rounded-lg border border-white/10 py-2 text-xs font-black text-white/55">Solo</button><button onClick={() => arm(track.id)} className={cn("rounded-lg border py-2 text-xs font-black", track.armed ? "border-red-400 bg-red-400 text-black" : "border-white/10 text-white/55")}>{track.armed ? "Armed" : "Arm"}</button></div><label className="mt-5 block text-[10px] font-black uppercase text-white/45">Volume<input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) })} className="mt-2 w-full accent-cyan-300" /></label><label className="mt-4 block text-[10px] font-black uppercase text-white/45">Input gain <span className="float-right text-cyan-200">{track.inputGain}%</span><input type="range" min="0" max="100" value={track.inputGain} onChange={(event) => update(track.id, { inputGain: Number(event.target.value) })} className="mt-2 w-full accent-green-300" /></label><button onClick={() => update(track.id, { inputGain: Math.max(28, Math.min(78, 132 - track.volume)) })} className="mt-2 w-full rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">Calibrate input gain</button></aside>;
}

function Mix({ tracks, selected, update }: { tracks: Track[]; selected: Track | null; update: (id: string, patch: Partial<Track>) => void }) {
  if (!tracks.length) return <div className="grid h-full place-items-center text-white/55">Import audio in Edit first.</div>;
  return <div className="h-full overflow-auto p-4"><div className="grid min-w-[900px] grid-cols-5 gap-3">{tracks.map((track) => <div key={track.id} className="rounded-2xl border border-white/10 bg-black/35 p-4"><b className="block text-center text-xs uppercase" style={{ color: track.color }}>{track.name}</b><input type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) })} className="mt-5 w-full accent-cyan-300" /></div>)}</div><p className="mt-4 text-xs uppercase text-white/35">Selected: {selected?.name ?? "none"}</p></div>;
}

function Export({ tracks, selected }: { tracks: Track[]; selected: Track | null }) {
  function download(track: Track) { const a = document.createElement("a"); a.href = track.clip.url; a.download = `${fileSlug(track.name)}.${track.clip.name.split(".").pop() || "audio"}`; a.click(); }
  return <div className="grid h-full place-items-center p-6"><div className="max-w-xl rounded-2xl border border-white/12 bg-black/40 p-6 text-center"><h2 className="text-3xl font-black uppercase text-cyan-200">Export Session</h2><p className="mt-3 text-sm text-white/55">Downloads real source audio from the session.</p><button disabled={!selected} onClick={() => selected && download(selected)} className="mt-5 rounded-full bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-40">Download selected audio</button><button disabled={!tracks.length} onClick={() => tracks.forEach(download)} className="ml-3 mt-5 rounded-full border border-white/15 px-6 py-3 text-xs font-black uppercase text-white/70 disabled:opacity-40">Download stems</button></div></div>;
}
