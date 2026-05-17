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

type ExtractedSound = {
  id: string;
  name: string;
  url: string;
  source: "extracted" | "upload";
  instrument: string;
  category?: string;
  durationSec?: number;
  sampleRate?: number;
  startSec?: number;
  sourceFile?: string;
  createdAt: string;
  kit?: string;
};

type RenderedOneShot = {
  localSound: ExtractedSound;
  cloudSound?: ExtractedSound;
  blob: Blob;
};

const CONNECTORS = [
  { name: "Splice", status: "ready path", note: "Import/downloaded loops into My Sounds, then extract one-shots from the loop." },
  { name: "Co-Producer", status: "ready path", note: "Accept generated loops/stems as uploads, analyze them, and extract usable one-shots." },
  { name: "RipX-style stem workflow", status: "bridge path", note: "Current layer extracts transient hits; future desktop/stem bridge can split vocals/drums/bass/music first." },
  { name: "Suno-style generated audio", status: "upload path", note: "Upload generated audio, detect unique hits/chops, save them into the EMS sound library." },
  { name: "VST/Desktop bridge", status: "bridge-ready", note: "Native plugin output can be bounced/imported, then extracted into pads and My Sounds." },
];

const EXTRACTED_KEY = "ems-smart-extracted-one-shots";
const MIDI_MY_SOUNDS_KEY = "ems-smart-mpc-my-sounds-v2";
const LEGACY_MY_SOUNDS_KEY = "ems-smart-mpc-my-sounds-v1";
const SAMPLER_INBOX_KEY = "ems-smart-extractor-sampler-inbox";
const TIMELINE_INBOX_KEY = "ems-smart-extractor-timeline-inbox";

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

function roleToCategory(role: string) {
  const lower = role.toLowerCase();
  if (lower.includes("kick") || lower.includes("snare") || lower.includes("clap") || lower.includes("hat") || lower.includes("perc") || lower.includes("drum")) return "drums";
  if (lower.includes("808") || lower.includes("bass")) return "808";
  if (lower.includes("texture") || lower.includes("fx")) return "fx";
  return "misc";
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

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function renderHitWav(buffer: AudioBuffer, hit: ExtractedHit) {
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const startSample = Math.max(0, Math.floor(hit.startSec * sampleRate));
  const length = Math.max(1, Math.min(buffer.length - startSample, Math.floor(hit.durationSec * sampleRate)));
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.006), Math.floor(length / 3));
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = length * blockAlign;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    const fadeIn = fadeSamples > 0 ? Math.min(1, i / fadeSamples) : 1;
    const fadeOut = fadeSamples > 0 ? Math.min(1, (length - i) / fadeSamples) : 1;
    const gain = Math.min(fadeIn, fadeOut);
    for (let ch = 0; ch < channels; ch += 1) {
      const source = buffer.getChannelData(ch)[startSample + i] ?? 0;
      const value = Math.max(-1, Math.min(1, source * gain));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([wav], { type: "audio/wav" });
}

function readStoredArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function prependStored<T extends { id?: string; url?: string }>(key: string, item: T, limit = 250) {
  const current = readStoredArray<T>(key);
  const deduped = [item, ...current].filter((entry, index, list) => list.findIndex((candidate) => (candidate.url || candidate.id) === (entry.url || entry.id)) === index);
  window.localStorage.setItem(key, JSON.stringify(deduped.slice(0, limit)));
}

function safeFileBase(name: string) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "extracted-hit";
}

async function uploadExtractedWav(blob: Blob, hit: ExtractedHit, analysis: ExtractAnalysis): Promise<ExtractedSound | null> {
  try {
    const fileName = `${safeFileBase(hit.name)}.wav`;
    const file = new File([blob], fileName, { type: "audio/wav" });
    const form = new FormData();
    form.append("file", file);
    form.append("kit", "extracted");
    form.append("instrument", hit.role);
    form.append("sourceFile", analysis.fileName);
    form.append("startSec", String(hit.startSec));
    form.append("durationSec", String(hit.durationSec));
    const res = await fetch("/api/studio/sounds/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok || !data?.sound) throw new Error(data?.error || "Cloud upload failed");
    return {
      ...(data.sound as ExtractedSound),
      source: "upload",
      instrument: hit.role,
      category: roleToCategory(hit.role),
      durationSec: hit.durationSec,
      sampleRate: analysis.sampleRate,
      startSec: hit.startSec,
      sourceFile: analysis.fileName,
      createdAt: data.sound.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export default function BeatMachineSmartExtractor() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [analysis, setAnalysis] = useState<ExtractAnalysis | null>(null);
  const [maxHits, setMaxHits] = useState(16);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Upload a loop or generated audio and extract usable one-shots from it.");
  const [renderedIds, setRenderedIds] = useState<Record<string, string>>({});
  const [cloudIds, setCloudIds] = useState<Record<string, string>>({});
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
    const audio = new Audio(renderedIds[hit.id] || cloudIds[hit.id] || analysis.url);
    audio.currentTime = renderedIds[hit.id] || cloudIds[hit.id] ? 0 : hit.startSec;
    audio.play().catch(() => undefined);
    window.setTimeout(() => audio.pause(), Math.max(120, hit.durationSec * 1000));
  }

  async function makeSound(hit: ExtractedHit, cloud = true): Promise<RenderedOneShot | null> {
    if (!analysis) return null;
    const blob = renderHitWav(analysis.buffer, hit);
    const localUrl = URL.createObjectURL(blob);
    const localSound: ExtractedSound = {
      id: `extracted-${hit.id}-${Date.now()}`,
      name: `${hit.name}.wav`,
      url: localUrl,
      source: "extracted",
      instrument: hit.role,
      category: roleToCategory(hit.role),
      durationSec: hit.durationSec,
      sampleRate: analysis.sampleRate,
      startSec: hit.startSec,
      sourceFile: analysis.fileName,
      createdAt: new Date().toISOString(),
    };
    setRenderedIds((current) => ({ ...current, [hit.id]: localUrl }));
    const cloudSound = cloud ? await uploadExtractedWav(blob, hit, analysis) : null;
    if (cloudSound?.url) setCloudIds((current) => ({ ...current, [hit.id]: cloudSound.url }));
    return { localSound, cloudSound: cloudSound ?? undefined, blob };
  }

  function saveToLibraries(sound: ExtractedSound) {
    prependStored(EXTRACTED_KEY, sound, 200);
    prependStored(MIDI_MY_SOUNDS_KEY, sound, 250);
    prependStored(LEGACY_MY_SOUNDS_KEY, sound, 250);
    window.dispatchEvent(new CustomEvent("ems:smart-mpc-sound-added", { detail: { sound } }));
  }

  async function renderAndSave(hit: ExtractedHit) {
    setBusy(true);
    const rendered = await makeSound(hit, true);
    setBusy(false);
    if (!rendered) return;
    const sound = rendered.cloudSound ?? rendered.localSound;
    saveToLibraries(sound);
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `${rendered.cloudSound ? "Cloud-saved" : "Locally rendered"} ${sound.name}.` } }));
    setNotice(`${rendered.cloudSound ? "Cloud-saved WAV to Supabase" : "Rendered local WAV fallback"} and added ${sound.name} to My Sounds.`);
  }

  async function assignToPad(hit: ExtractedHit) {
    setBusy(true);
    const rendered = await makeSound(hit, true);
    setBusy(false);
    if (!rendered) return;
    const sound = rendered.cloudSound ?? rendered.localSound;
    saveToLibraries(sound);
    window.dispatchEvent(new CustomEvent("ems:smart-mpc-assign-selected-pad", { detail: { sound } }));
    setNotice(`${rendered.cloudSound ? "Cloud-saved" : "Rendered"} ${sound.name} and assigned it to the selected MPC pad.`);
  }

  async function sendToSampler(hit: ExtractedHit) {
    setBusy(true);
    const rendered = await makeSound(hit, true);
    setBusy(false);
    if (!rendered) return;
    const sound = rendered.cloudSound ?? rendered.localSound;
    saveToLibraries(sound);
    prependStored(SAMPLER_INBOX_KEY, sound, 64);
    window.dispatchEvent(new CustomEvent("ems:smart-extractor-send-sampler", { detail: { sound, autoLoad: true } }));
    setNotice(`${sound.name} saved and sent to the sampler for auto-load.`);
  }

  async function sendToTimeline(hit: ExtractedHit) {
    setBusy(true);
    const rendered = await makeSound(hit, true);
    setBusy(false);
    if (!rendered) return;
    const sound = rendered.cloudSound ?? rendered.localSound;
    saveToLibraries(sound);
    prependStored(TIMELINE_INBOX_KEY, sound, 64);
    window.dispatchEvent(new CustomEvent("ems:studio-place-sound", { detail: { sound, confirm: true, source: "smart-extractor" } }));
    window.dispatchEvent(new CustomEvent("ems:smart-extractor-send-timeline", { detail: { sound } }));
    window.dispatchEvent(new CustomEvent("ems:studio-toast", { detail: { message: `${sound.name} placed on timeline from Smart Extractor.` } }));
    setNotice(`${sound.name} saved and sent to the studio timeline.`);
  }

  async function batchExportHits() {
    if (!analysis) return;
    setBusy(true);
    const exported: ExtractedSound[] = [];
    for (const hit of bestHits) {
      const rendered = await makeSound(hit, false);
      if (rendered) {
        saveToLibraries(rendered.localSound);
        exported.push(rendered.localSound);
      }
    }
    setBusy(false);
    const blob = new Blob([JSON.stringify({ type: "ems-extracted-one-shot-kit", sounds: exported, sourceFile: analysis.fileName, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ems-extracted-one-shot-kit.json";
    a.click();
    URL.revokeObjectURL(url);
    setNotice(`Batch rendered ${exported.length} one-shot WAVs locally and exported the kit map.`);
  }

  function exportMap() {
    const blob = new Blob([JSON.stringify({ type: "ems-smart-extraction-map", analysis: analysis ? { ...analysis, buffer: undefined } : null, connectors: CONNECTORS, cloudSaved: cloudIds, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
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
          <h2 className="text-sm font-black uppercase tracking-wide text-white sm:text-lg">Upload loop → render/cloud-save WAV one-shots → My Sounds → pad/sampler/timeline</h2>
        </div>
        <input ref={inputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} />
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-black uppercase text-white/55">Hits <input type="range" min={4} max={32} value={maxHits} onChange={(event) => setMaxHits(Number(event.target.value))} className="accent-green-300" /> {maxHits}</label>
        <button onClick={() => inputRef.current?.click()} className="rounded-xl border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">{busy ? "Working" : "Upload Loop"}</button>
        <button onClick={() => void batchExportHits()} disabled={!analysis || busy} className="rounded-xl border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase text-yellow-100 disabled:opacity-40">Batch Kit</button>
        <button onClick={exportMap} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Export Map</button>
      </div>

      <div className="mt-2 rounded-xl border border-white/10 bg-black/35 p-2 text-xs font-bold text-white/65">{notice}</div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {analysis ? bestHits.map((hit) => <div key={hit.id} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
            <div className="flex items-center justify-between gap-2"><b className="truncate text-xs uppercase text-green-100">{hit.name}</b><span className="rounded-full border border-white/10 px-2 py-1 text-[8px] uppercase text-white/45">{hit.role}</span></div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] uppercase text-white/45"><span>{hit.startSec}s</span><span>{hit.durationSec}s</span><span>{Math.round(hit.confidence * 100)}%</span></div>
            {cloudIds[hit.id] ? <div className="mt-2 rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[9px] font-black uppercase text-cyan-100">Supabase saved</div> : renderedIds[hit.id] ? <div className="mt-2 rounded border border-green-300/20 bg-green-300/10 px-2 py-1 text-[9px] font-black uppercase text-green-100">WAV rendered</div> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => preview(hit)} className="rounded-lg border border-cyan-300/25 px-2 py-2 text-[10px] uppercase text-cyan-100">Preview</button>
              <button onClick={() => void renderAndSave(hit)} className="rounded-lg border border-green-300/25 px-2 py-2 text-[10px] uppercase text-green-100">Cloud Save</button>
              <button onClick={() => void assignToPad(hit)} className="rounded-lg border border-yellow-300/25 px-2 py-2 text-[10px] uppercase text-yellow-100">Assign Pad</button>
              <button onClick={() => void sendToSampler(hit)} className="rounded-lg border border-pink-300/25 px-2 py-2 text-[10px] uppercase text-pink-100">Sampler</button>
              <button onClick={() => void sendToTimeline(hit)} className="col-span-2 rounded-lg border border-purple-300/25 px-2 py-2 text-[10px] uppercase text-purple-100">Timeline</button>
            </div>
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
