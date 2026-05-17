"use client";

import { useMemo, useRef, useState } from "react";

type ExtractedHit = {
  id: string;
  name: string;
  startSec: number;
  durationSec: number;
  peak: number;
  role: string;
  confidence: number;
};

type ExtractAnalysis = {
  fileName: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  hitCount: number;
  hits: ExtractedHit[];
  url: string;
  buffer: AudioBuffer;
};

const CONNECTORS = [
  { name: "Splice", status: "ready path", note: "Import/downloaded loops into My Sounds, then extract one-shots from the loop." },
  { name: "Co-Producer", status: "ready path", note: "Accept generated loops/stems as uploads, analyze them, and extract usable one-shots." },
  { name: "RipX-style stem workflow", status: "bridge path", note: "Current layer extracts transient hits; future desktop/stem bridge can split vocals/drums/bass/music first." },
  { name: "Suno-style generated audio", status: "upload path", note: "Upload generated audio, detect unique hits/chops, save them into the EMS sound library." },
  { name: "VST/Desktop bridge", status: "bridge-ready", note: "Native plugin output can be bounced/imported, then extracted into pads and My Sounds." },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readFile(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsArrayBuffer(file);
  });
}

function fileUrl(file: File) {
  return URL.createObjectURL(file);
}

function mono(buffer: AudioBuffer, index: number) {
  let sum = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) sum += buffer.getChannelData(ch)[index] ?? 0;
  return sum / Math.max(1, buffer.numberOfChannels);
}

function inferRole(name: string, startSec: number, peak: number) {
  const lower = name.toLowerCase();
  if (lower.includes("kick")) return "kick";
  if (lower.includes("snare") || lower.includes("clap")) return "snare/clap";
  if (lower.includes("hat")) return "hat";
  if (lower.includes("808") || lower.includes("bass")) return "808/bass";
  if (peak > 0.74 && startSec < 1.5) return "impact/kick candidate";
  if (peak > 0.52) return "drum/percussion candidate";
  return "texture/one-shot candidate";
}

function detectHits(buffer: AudioBuffer, fileName: string, maxHits: number) {
  const win = Math.max(128, Math.floor(buffer.sampleRate * 0.012));
  const hop = Math.max(64, Math.floor(win / 2));
  const energies: number[] = [];
  const peaks: number[] = [];
  const times: number[] = [];
  for (let start = 0; start < buffer.length - win; start += hop) {
    let energy = 0;
    let peak = 0;
    for (let i = start; i < start + win; i += 1) {
      const value = mono(buffer, i);
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    energies.push(Math.sqrt(energy / win));
    peaks.push(peak);
    times.push(start / buffer.sampleRate);
  }
  const avg = energies.reduce((a, b) => a + b, 0) / Math.max(1, energies.length);
  const threshold = Math.max(0.025, avg * 1.65);
  const hits: ExtractedHit[] = [];
  for (let i = 2; i < energies.length - 2; i += 1) {
    const rising = energies[i] > energies[i - 1] * 1.18 && energies[i] > threshold;
    const peakLocal = energies[i] >= energies[i - 1] && energies[i] >= energies[i + 1];
    const time = times[i];
    if (!rising || !peakLocal) continue;
    if (hits.length && time - hits[hits.length - 1].startSec < 0.08) continue;
    const nextCandidate = times.slice(i + 1).find((candidate) => candidate - time > 0.12) ?? time + 0.5;
    const durationSec = clamp(nextCandidate - time, 0.08, 1.5);
    const peak = peaks[i];
    hits.push({
      id: `hit-${Date.now()}-${hits.length}`,
      name: `${fileName.replace(/\.[^.]+$/, "")} hit ${hits.length + 1}`,
      startSec: Number(time.toFixed(3)),
      durationSec: Number(durationSec.toFixed(3)),
      peak: Number(peak.toFixed(3)),
      role: inferRole(fileName, time, peak),
      confidence: Number(clamp(peak / Math.max(0.01, threshold), 0.25, 1).toFixed(2)),
    });
    if (hits.length >= maxHits) break;
  }
  return hits;
}

async function analyzeLoop(file: File, maxHits: number): Promise<ExtractAnalysis> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext is not available in this browser.");
  const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
  const buffer = await ctx.decodeAudioData((await readFile(file)).slice(0));
  const hits = detectHits(buffer, file.name, maxHits);
  await ctx.close().catch(() => undefined);
  return { fileName: file.name, durationSec: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, hitCount: hits.length, hits, url: fileUrl(file), buffer };
}

export default function BeatMachineSmartExtractor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [analysis, setAnalysis] = useState<ExtractAnalysis | null>(null);
  const [maxHits, setMaxHits] = useState(16);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Upload a loop or generated audio and extract usable one-shots from it.");
  const bestHits = useMemo(() => [...(analysis?.hits ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 8), [analysis]);

  async function handleFile(file: File) {
    if (!file.type.startsWith("audio/")) {
      setNotice("Upload an audio file or loop.");
      return;
    }
    setBusy(true);
    try {
      const result = await analyzeLoop(file, maxHits);
      setAnalysis(result);
      setNotice(`Extracted ${result.hitCount} one-shot candidates from ${file.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not extract one-shots from this loop.");
    } finally {
      setBusy(false);
    }
  }

  function preview(hit: ExtractedHit) {
    if (!analysis) return;
    const audio = new Audio(analysis.url);
    audio.currentTime = hit.startSec;
    audio.play().catch(() => undefined);
    window.setTimeout(() => audio.pause(), Math.max(120, hit.durationSec * 1000));
  }

  function saveHit(hit: ExtractedHit) {
    const payload = { ...hit, sourceFile: analysis?.fileName, sourceUrl: analysis?.url, savedAt: new Date().toISOString() };
    const key = "ems-smart-extracted-one-shots";
    const current = JSON.parse(window.localStorage.getItem(key) || "[]") as unknown[];
    window.localStorage.setItem(key, JSON.stringify([payload, ...current].slice(0, 200)));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `Saved ${hit.name} to extracted one-shots.` } }));
    setNotice(`Saved ${hit.name} to the extracted one-shots library.`);
  }

  function exportMap() {
    const blob = new Blob([JSON.stringify({ type: "ems-smart-extraction-map", analysis: analysis ? { ...analysis, buffer: undefined } : null, connectors: CONNECTORS, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ems-smart-extraction-map.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <section className="mx-auto mb-2 max-w-[1900px] px-2 sm:px-4">
    <div className="rounded-2xl border border-green-300/25 bg-black/55 p-3 shadow-[0_0_26px_rgba(66,255,86,.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-green-200/70">Smart Extractor / Loop-to-One-Shots</p>
          <h2 className="text-sm font-black uppercase tracking-wide text-white sm:text-lg">Upload loop → detect hits → save one-shots → feed pads, sampler, and My Sounds</h2>
        </div>
        <input ref={inputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} />
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-black uppercase text-white/55">Hits <input type="range" min={4} max={32} value={maxHits} onChange={(event) => setMaxHits(Number(event.target.value))} className="accent-green-300" /> {maxHits}</label>
        <button onClick={() => inputRef.current?.click()} className="rounded-xl border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">{busy ? "Extracting" : "Upload Loop"}</button>
        <button onClick={exportMap} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Export Map</button>
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-black/35 p-2 text-xs font-bold text-white/65">{notice}</div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {analysis ? bestHits.map((hit) => <div key={hit.id} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
            <div className="flex items-center justify-between gap-2"><b className="truncate text-xs uppercase text-green-100">{hit.name}</b><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] uppercase text-white/45">{hit.role}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] uppercase text-white/45"><span>{hit.startSec}s</span><span>{hit.durationSec}s</span><span>{Math.round(hit.confidence * 100)}%</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => preview(hit)} className="rounded-lg border border-cyan-300/25 px-2 py-2 text-[10px] uppercase text-cyan-100">Preview</button><button onClick={() => saveHit(hit)} className="rounded-lg border border-green-300/25 px-2 py-2 text-[10px] uppercase text-green-100">Save Hit</button></div>
          </div>) : <p className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-sm text-white/45 md:col-span-2 xl:col-span-4">No loop analyzed yet. This is where extracted one-shot candidates will show up.</p>}
        </main>
        <aside className="rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Compatible sources</p>
          <div className="mt-3 grid gap-2">
            {CONNECTORS.map((item) => <div key={item.name} className="rounded-lg border border-white/10 bg-black/35 p-2"><div className="flex items-center justify-between gap-2"><b className="text-xs uppercase text-white">{item.name}</b><span className="rounded-full border border-green-300/25 px-2 py-1 text-[8px] uppercase text-green-100">{item.status}</span></div><p className="mt-1 text-[10px] leading-4 text-white/45">{item.note}</p></div>)}
          </div>
          {analysis ? <div className="mt-3 rounded-lg border border-green-300/15 bg-green-300/[.04] p-2 text-[10px] uppercase leading-4 text-green-100/80">{analysis.fileName}: {analysis.hitCount} hits · {analysis.durationSec.toFixed(2)}s · {analysis.sampleRate} Hz · {analysis.channels}ch</div> : null}
        </aside>
      </div>
    </div>
  </section>;
}
