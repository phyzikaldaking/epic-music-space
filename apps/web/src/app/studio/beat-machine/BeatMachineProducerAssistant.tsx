"use client";

import { useMemo, useRef, useState } from "react";

type Genre = "trap" | "rnb" | "drill" | "afrobeats" | "cinematic" | "boomBap" | "pop" | "soul";

type Analysis = {
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bpm: number;
  key: string;
  role: string;
  energy: string;
  brightness: string;
  transients: number;
};

type Plan = {
  genre: Genre;
  bpm: number;
  key: string;
  swing: number;
  pattern: Record<string, number[]>;
  arrangement: string[];
  mix: string[];
};

const GENRES: { id: Genre; label: string; bpm: number; swing: number }[] = [
  { id: "trap", label: "Trap", bpm: 140, swing: 18 },
  { id: "rnb", label: "R&B", bpm: 86, swing: 24 },
  { id: "drill", label: "Drill", bpm: 144, swing: 10 },
  { id: "afrobeats", label: "Afrobeats", bpm: 104, swing: 28 },
  { id: "cinematic", label: "Cinematic", bpm: 92, swing: 8 },
  { id: "boomBap", label: "Boom Bap", bpm: 90, swing: 34 },
  { id: "pop", label: "Pop", bpm: 112, swing: 12 },
  { id: "soul", label: "Soul Sample", bpm: 84, swing: 30 },
];

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

function sampleAt(buffer: AudioBuffer, index: number) {
  let sum = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) sum += buffer.getChannelData(ch)[index] ?? 0;
  return sum / Math.max(1, buffer.numberOfChannels);
}

function countTransients(buffer: AudioBuffer) {
  const hop = Math.max(128, Math.floor(buffer.sampleRate * 0.012));
  const levels: number[] = [];
  for (let i = 0; i < buffer.length - hop; i += hop) {
    let energy = 0;
    for (let j = i; j < i + hop; j += 1) {
      const v = sampleAt(buffer, j);
      energy += v * v;
    }
    levels.push(Math.sqrt(energy / hop));
  }
  const avg = levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length);
  return levels.filter((value, index) => index > 0 && value > avg * 1.7 && value > levels[index - 1] * 1.18).length;
}

function estimateKey(buffer: AudioBuffer) {
  const hop = Math.max(64, Math.floor(buffer.sampleRate / 22050));
  const end = Math.min(buffer.length, Math.floor(buffer.sampleRate * 8));
  let last = sampleAt(buffer, 0);
  let crossings = 0;
  for (let i = hop; i < end; i += hop) {
    const v = sampleAt(buffer, i);
    if ((last <= 0 && v > 0) || (last >= 0 && v < 0)) crossings += 1;
    last = v;
  }
  const hz = clamp((crossings / Math.max(0.1, end / buffer.sampleRate)) / 2, 55, 1760);
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTES[((midi % 12) + 12) % 12]} ${midi % 24 < 12 ? "minor" : "major"}`;
}

async function analyze(file: File, genre: Genre): Promise<Analysis> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Audio is not supported in this browser.");
  const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
  const buffer = await ctx.decodeAudioData((await readFile(file)).slice(0));
  const step = Math.max(1, Math.floor(buffer.length / 60000));
  let sum = 0;
  let peak = 0;
  let crossings = 0;
  let last = sampleAt(buffer, 0);
  for (let i = 0; i < buffer.length; i += step) {
    const v = sampleAt(buffer, i);
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
    if ((last <= 0 && v > 0) || (last >= 0 && v < 0)) crossings += 1;
    last = v;
  }
  await ctx.close().catch(() => undefined);
  const rms = Math.sqrt(sum / Math.max(1, Math.ceil(buffer.length / step)));
  const transients = countTransients(buffer);
  const preset = GENRES.find((item) => item.id === genre) ?? GENRES[0];
  const name = file.name.toLowerCase();
  const role = name.includes("kick") ? "kick" : name.includes("snare") || name.includes("clap") ? "snare" : name.includes("808") || name.includes("bass") ? "808/bass" : name.includes("hat") ? "hat" : name.includes("vocal") || name.includes("vox") ? "vocal sample" : name.includes("piano") || name.includes("key") || name.includes("melody") ? "melody" : transients > 24 ? "loop" : "sample";
  const brightnessScore = crossings / Math.max(1, Math.ceil(buffer.length / step));
  return {
    name: file.name,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    bpm: preset.bpm,
    key: estimateKey(buffer),
    role,
    energy: rms > 0.18 || peak > 0.9 ? "high" : rms > 0.07 ? "medium" : "low",
    brightness: brightnessScore > 0.16 ? "bright" : brightnessScore > 0.08 ? "balanced" : "dark",
    transients,
  };
}

function buildPlan(genre: Genre, analysis: Analysis | null): Plan {
  const preset = GENRES.find((item) => item.id === genre) ?? GENRES[0];
  const bpm = analysis?.bpm ?? preset.bpm;
  const key = analysis?.key ?? "C minor";
  const role = analysis?.role ?? "sample";
  const pattern = genre === "drill"
    ? { kick: [1, 8, 11, 15], snare: [5, 13], hat: [1, 2, 4, 6, 9, 10, 12, 15], bass: [1, 6, 8, 11, 15] }
    : genre === "afrobeats"
      ? { kick: [1, 4, 7, 11, 14], snare: [5, 13], hat: [1, 3, 6, 8, 10, 12, 15], bass: [1, 5, 9, 12, 16] }
      : genre === "rnb"
        ? { kick: [1, 6, 11], snare: [5, 13], hat: [1, 4, 7, 10, 13, 16], bass: [1, 5, 9, 14] }
        : { kick: [1, 7, 11, 15], snare: [5, 13], hat: [1, 3, 5, 7, 9, 11, 13, 15], bass: [1, 4, 7, 11, 14] };
  return {
    genre,
    bpm,
    key,
    swing: preset.swing,
    pattern,
    arrangement: [
      `Intro 4 bars: filter the ${role} and keep drums light.`,
      "Verse 16 bars: main groove with fewer fills and room for vocals.",
      "Hook 8 bars: full drums, bass, melody, and highest energy.",
      "Bridge 4 bars: remove kick or snare, reverse/fade a chop, then return.",
      "Outro 4 bars: strip drums and filter music down.",
    ],
    mix: [
      `Tune bass/808 to ${key}; keep sub mono below 120 Hz.`,
      "Kick: center mono, remove sub rumble below 28 Hz, short punch.",
      "Snare/clap: clean 250-400 Hz mud, add 2-7 kHz snap if needed.",
      "Hats/percussion: control 8-12 kHz harshness and humanize velocity.",
      "Sample/melody: high-pass if it is not bass; carve 1-3 kHz for vocal pocket.",
      "Master: leave -6 dB headroom and use soft clipping before limiter.",
    ],
  };
}

export default function BeatMachineProducerAssistant() {
  const [genre, setGenre] = useState<Genre>("trap");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Upload audio, choose a genre, and generate a production plan.");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const plan = useMemo(() => buildPlan(genre, analysis), [genre, analysis]);

  async function onFile(file: File) {
    if (!file.type.startsWith("audio/")) return setNotice("Please upload an audio file.");
    setBusy(true);
    try {
      const result = await analyze(file, genre);
      setAnalysis(result);
      setNotice(`Analyzed ${result.name}: ${result.role}, ${result.key}, ${result.energy} energy.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not analyze audio.");
    } finally {
      setBusy(false);
    }
  }

  function usePlan() {
    const payload = { analysis, plan, updatedAt: new Date().toISOString() };
    window.localStorage.setItem("ems-producer-assistant-plan", JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `Producer plan ready: ${plan.bpm} BPM in ${plan.key}.` } }));
    setNotice("Saved plan to this session for the beat machine/studio workflow.");
  }

  function exportPlan() {
    const blob = new Blob([JSON.stringify({ analysis, plan, generatedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ems-producer-assistant-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return <section className="mx-auto mb-2 max-w-[1900px] px-2 sm:px-4">
    <div className="rounded-2xl border border-yellow-300/25 bg-black/60 p-3 shadow-[0_0_30px_rgba(246,214,61,.10)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-yellow-200/75">Producer Assistant</p>
          <h2 className="text-lg font-black uppercase tracking-wide text-white sm:text-2xl">Upload sound → analyze → arrange by genre → mix map</h2>
        </div>
        <input ref={inputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void onFile(file); event.currentTarget.value = ""; }} />
        <select value={genre} onChange={(event) => setGenre(event.target.value as Genre)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-xs font-black uppercase tracking-widest text-yellow-100">
          {GENRES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <button onClick={() => inputRef.current?.click()} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">{busy ? "Analyzing" : "Upload + Analyze"}</button>
        <button onClick={usePlan} className="rounded-xl border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">Use Plan</button>
        <button onClick={exportPlan} className="rounded-xl border border-pink-300/35 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase text-pink-100">Export</button>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-white/70">{notice}</div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-white/10 bg-white/[.035] p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Audio readout</p>
          {analysis ? <div className="mt-3 grid gap-2 text-xs text-white/65">
            <span><b className="text-white">File:</b> {analysis.name}</span>
            <span><b className="text-white">Role:</b> {analysis.role}</span>
            <span><b className="text-white">Key:</b> {analysis.key}</span>
            <span><b className="text-white">Energy:</b> {analysis.energy}</span>
            <span><b className="text-white">Tone:</b> {analysis.brightness}</span>
            <span><b className="text-white">Hits:</b> {analysis.transients}</span>
            <span><b className="text-white">Length:</b> {analysis.duration.toFixed(2)}s</span>
          </div> : <p className="mt-3 text-sm leading-5 text-white/45">No analysis yet. Upload a sound to classify it and build a plan around it.</p>}
        </aside>
        <main className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4"><Stat label="BPM" value={String(plan.bpm)} /><Stat label="Key" value={plan.key} /><Stat label="Swing" value={`${plan.swing}%`} /><Stat label="Genre" value={GENRES.find((item) => item.id === genre)?.label ?? genre} /></div>
          <div className="grid gap-2 md:grid-cols-5">{plan.arrangement.map((item) => <div key={item} className="rounded-xl border border-white/10 bg-white/[.035] p-3 text-xs leading-5 text-white/65">{item}</div>)}</div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">{plan.mix.map((item) => <div key={item} className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.035] p-3 text-[11px] leading-5 text-white/65">{item}</div>)}</div>
          <div className="rounded-xl border border-green-300/15 bg-green-300/[.04] p-3 text-[10px] font-black uppercase tracking-wider text-green-100/80">Pattern: kick {plan.pattern.kick.join("-")} · snare {plan.pattern.snare.join("-")} · hat {plan.pattern.hat.join("-")} · bass {plan.pattern.bass.join("-")}</div>
        </main>
      </div>
    </div>
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[.035] p-3"><span className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</span><b className="mt-1 block truncate text-lg uppercase text-white">{value}</b></div>;
}
