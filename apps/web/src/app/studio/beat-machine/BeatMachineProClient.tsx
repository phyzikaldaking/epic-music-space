"use client";

import { useEffect, useRef, useState } from "react";
import lamejs from "lamejs";
import { studioTransport } from "../../../lib/studioTransport";
import { getStudioAudioContext, registerStudioSource, resumeStudioAudio, stopAllStudioAudio } from "../../../lib/studioAudio";
import { trackStudio, trackStudioError } from "../../../lib/studioTelemetry";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://oynplifjdizzdahnurgi.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const LIVE_SAMPLE_NAMES: string[] = [];
const sampleUrl = (name: string) => {
  const bucket = name === "HIP_Snaph_3.wav" ? "studio-kits" : "audio-assets";
  const encodedPath = name.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
};
import { buildBeatStemRenderPlan, type BeatStemRenderPlan } from "./beatStemPrint";

type Pad = { id: string; label: string; key: string; color: string; freq: number; volume: number; pan: number; muted: boolean; solo: boolean; steps: boolean[]; sampleAsset?: string; tune?: number; mode?: "one-shot" | "loop"; sliceStart?: number; sliceDuration?: number; stepVelocity?: number[]; stepProbability?: number[]; stepPitch?: number[]; stepPan?: number[]; stepMuted?: boolean[]; stepReverse?: boolean[]; stepRatchet?: number[]; reverbSend?: number; delaySend?: number; busId?: string; busVolume?: number; busPan?: number; insertEffects?: string[]; automation?: { gain?: Array<{ timeSec: number; value: number }>; pan?: Array<{ timeSec: number; value: number }> } };
type Preset = { name: string; volumes: Record<string, number>; pans: Record<string, number> };

const DEFAULT_PATTERN_LENGTH = 16;
const makeSteps = (on: number[]) => Array.from({ length: DEFAULT_PATTERN_LENGTH }, (_, i) => on.includes(i + 1));
const initialPads: Pad[] = [
  { id: "kick", label: "KICK", key: "1", color: "#20f7ff", freq: 54, volume: 88, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "snare", label: "SNARE", key: "2", color: "#ff31df", freq: 180, volume: 74, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "hat", label: "HAT", key: "3", color: "#a75cff", freq: 6500, volume: 48, pan: 14, muted: false, solo: false, steps: makeSteps([]) },
  { id: "clap", label: "CLAP", key: "4", color: "#a75cff", freq: 260, volume: 60, pan: -8, muted: false, solo: false, steps: makeSteps([]) },
  { id: "bass", label: "808", key: "Q", color: "#f2c85b", freq: 42, volume: 82, pan: 0, muted: false, solo: false, steps: makeSteps([]) },
  { id: "perc", label: "PERC", key: "W", color: "#16e59a", freq: 410, volume: 55, pan: 18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "vox", label: "VOX", key: "E", color: "#20c8ff", freq: 330, volume: 58, pan: -18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "fx", label: "FX", key: "R", color: "#ff4f8b", freq: 920, volume: 42, pan: 24, muted: false, solo: false, steps: makeSteps([]) },
];
const presets: Preset[] = [
  { name: "Trap Knock", volumes: { kick: 94, snare: 72, hat: 52, clap: 50, bass: 92, perc: 54, vox: 44, fx: 34 }, pans: { hat: 8, perc: -18, vox: 16, fx: 28 } },
  { name: "Clean Punch", volumes: { kick: 90, snare: 76, hat: 44, clap: 58, bass: 80, perc: 48, vox: 56, fx: 38 }, pans: { hat: 12, perc: 18, vox: -14, fx: 22 } },
  { name: "Lo-Fi Space", volumes: { kick: 68, snare: 58, hat: 34, clap: 42, bass: 62, perc: 38, vox: 72, fx: 64 }, pans: { hat: 18, perc: -22, vox: -8, fx: 30 } },
];

function cn(...v: Array<string | false | undefined | null>) { return v.filter(Boolean).join(" "); }
function buildSampleSlices(duration: number, count = 8) { return Array.from({ length: count }, (_, index) => ({ index, start: (duration / count) * index, duration: duration / count })); }
function readWaveform(buffer: AudioBuffer, bars = 48) {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bars));
  return Array.from({ length: bars }, (_, index) => {
    let peak = 0;
    for (let i = index * step; i < Math.min(data.length, (index + 1) * step); i += 1) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    return peak;
  });
}
function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)); }
function download(name: string, text: string) { const blob = new Blob([text], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

function validateWav(blob: Blob) { return blob.size > 44 && blob.type === "audio/wav"; }
function measureBuffer(buffer: AudioBuffer) { let peak = 0; for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value)); return { truePeakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, clipped: peak >= 1 }; }
function normalizeBuffer(buffer: AudioBuffer, targetPeak = 0.891) { const metrics = measureBuffer(buffer); if (!Number.isFinite(metrics.truePeakDb) || metrics.truePeakDb <= 20 * Math.log10(targetPeak)) return metrics; const gain = targetPeak / Math.max(0.000001, 10 ** (metrics.truePeakDb / 20)); for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) { const data = buffer.getChannelData(channel); for (let i = 0; i < data.length; i += 1) data[i] = Math.max(-1, Math.min(1, data[i] * gain)); } return measureBuffer(buffer); }
async function mixWavBlobs(blobs: Blob[], busSettings: Record<string, { volume: number; pan: number }> = {}) {
  const context = getStudioAudioContext();
  const buffers = await Promise.all(blobs.map(async (blob) => context.decodeAudioData(await blob.arrayBuffer())));
  const duration = Math.max(0, ...buffers.map((buffer) => buffer.duration));
  const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * 44100)), 44100);
  buffers.forEach((buffer, index) => { const source = offline.createBufferSource(); source.buffer = buffer; const bus = Object.values(busSettings)[index] ?? { volume: 1, pan: 0 }; const gain = offline.createGain(); const pan = offline.createStereoPanner(); gain.gain.value = bus.volume; pan.pan.value = bus.pan; source.connect(gain).connect(pan).connect(offline.destination); source.start(0); });
  const rendered = await offline.startRendering();
  normalizeBuffer(rendered);
  return audioBufferToWav(rendered);
}
function audioBufferToMp3(buffer: AudioBuffer) {
  const encoder = new lamejs.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, 192);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < buffer.length; offset += 1152) {
    const left16 = Int16Array.from(left.slice(offset, offset + 1152), (value) => Math.max(-32768, Math.min(32767, value * 32767)));
    const right16 = Int16Array.from(right.slice(offset, offset + 1152), (value) => Math.max(-32768, Math.min(32767, value * 32767)));
    const encoded = encoder.encodeBuffer(left16, right16);
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length) chunks.push(new Uint8Array(flushed));
  return new Blob(chunks.map((chunk) => new Uint8Array(chunk).buffer as ArrayBuffer), { type: "audio/mpeg" });
}
function audioBufferToWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const bytesPerSample = 2;
  const frameBytes = channels * bytesPerSample;
  const output = new ArrayBuffer(44 + buffer.length * frameBytes);
  const view = new DataView(output);
  const write = (offset: number, value: string) => Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, output.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * frameBytes, true);
  view.setUint16(32, frameBytes, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, buffer.length * frameBytes, true);
  let offset = 44;
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

async function renderBeatStem(stem: BeatStemRenderPlan, pad?: Pad, sample?: AudioBuffer) {
  const sampleRate = 44_100;
  const context = new OfflineAudioContext(2, Math.ceil(stem.durationSec * sampleRate), sampleRate);
  const trackGain = context.createGain();
  const pan = context.createStereoPanner();
  const compressor = context.createDynamicsCompressor();
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = pad?.insertEffects?.includes("low-pass") ? 12000 : 22000;
  compressor.threshold.value = pad?.insertEffects?.includes("compressor") ? -18 : 0;
  compressor.ratio.value = pad?.insertEffects?.includes("compressor") ? 4 : 1;
  trackGain.gain.value = Math.max(0.0001, stem.volume / 100);
  pan.pan.value = stem.pan / 50;
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  const reverbReturn = context.createConvolver();
  const reverbGain = context.createGain();
  const delay = context.createDelay(2);
  const delayGain = context.createGain();
  const impulse = context.createBuffer(2, sampleRate * 2, sampleRate);
  for (let channel = 0; channel < 2; channel += 1) { const data = impulse.getChannelData(channel); for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2; }
  reverbReturn.buffer = impulse;
  reverbGain.gain.value = Math.max(0, Math.min(1, pad?.reverbSend ?? 0));
  delay.delayTime.value = Math.max(0.05, Math.min(2, (pad?.delaySend ?? 0) > 0 ? 0.25 : 0.05));
  delayGain.gain.value = Math.max(0, Math.min(0.8, pad?.delaySend ?? 0));
  trackGain.connect(lowpass).connect(compressor).connect(pan).connect(master);
  pan.connect(reverbReturn).connect(reverbGain).connect(master);
  pan.connect(delay).connect(delayGain).connect(master);
  master.connect(limiter).connect(context.destination);
  stem.hitTimesSec.forEach((start, index) => {
    const source = context.createBufferSource();
    if (sample) { source.buffer = sample; source.playbackRate.value = Math.pow(2, (pad?.stepPitch?.[index] ?? 0) / 12); }
    else {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = stem.frequency;
      oscillator.type = stem.id === "hat" || stem.id === "fx" ? "square" : stem.id === "bass" || stem.id === "kick" ? "sine" : "triangle";
      oscillator.connect(trackGain);
      oscillator.start(start);
      oscillator.stop(start + 0.7);
      return;
    }
    const velocity = (pad?.stepVelocity?.[index] ?? 100) / 100;
    trackGain.gain.setValueAtTime(Math.max(0.0001, (stem.volume / 100) * velocity), start);
    const automation = pad?.automation?.gain?.find((point) => point.timeSec >= start);
    if (automation) trackGain.gain.linearRampToValueAtTime(Math.max(0.0001, automation.value), start + 0.01);
    source.connect(trackGain);
    source.start(start, pad?.sliceStart ?? 0, pad?.sliceDuration);
  });
  return audioBufferToWav(await context.startRendering());
}

export type PrintedBeatStem = BeatStemRenderPlan & { blob: Blob; name: string; kind: "drum" | "bass" | "vocal" | "fx" };

export default function BeatMachineProClient({ studioMode = false, onPrintToStudio }: { initialView?: string; studioMode?: boolean; onPrintToStudio?: (stems: PrintedBeatStem[]) => Promise<void> | void }) {
  const [padBank, setPadBank] = useState(0);
  const [padBanks, setPadBanks] = useState<Record<number, Pad[]>>(() => ({
    0: initialPads,
    1: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    2: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    3: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
  }));
  const pads = padBanks[padBank] ?? initialPads;
  const setPads = (updater: (current: Pad[]) => Pad[]) => setPadBanks((current) => ({ ...current, [padBank]: updater(current[padBank] ?? initialPads) }));
  const [selected, setSelected] = useState("kick");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedStep, setSelectedStep] = useState(0);
  const [patternChain, setPatternChain] = useState<number[]>([0]);
  const chainPosition = useRef(0);
  const [bpm, setBpm] = useState(140);
  const [patternLength, setPatternLength] = useState<8 | 16>(16);
  const [swing, setSwing] = useState(0);
  const [patternName, setPatternName] = useState("Untitled Pattern");
  const [savedPatterns, setSavedPatterns] = useState<Record<string, unknown>>({});
  const tapTimes = useRef<number[]>([]);
  const [printing, setPrinting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<Array<{ id: string; kind: string; createdAt: string; fileName: string; status: string }>>([]);
  const exportAbort = useRef<AbortController | null>(null);
  const [liveSamples, setLiveSamples] = useState<string[]>([]);
  const [sampleLibraryLoading, setSampleLibraryLoading] = useState(true);
  const [sampleQuery, setSampleQuery] = useState("");
  const [sampleCategory, setSampleCategory] = useState<"all" | "drums" | "bass" | "vocal" | "fx">("all");
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [sampleWaveform, setSampleWaveform] = useState<number[]>([]);
  const [sampleSlices, setSampleSlices] = useState<Array<{ index: number; start: number; duration: number }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const sampleBuffers = useRef<Record<string, AudioBuffer>>({});
  const sampleUrls = useRef<Record<string, string>>({});
  const sampleSources = useRef<Record<string, "kit" | "factory">>({});
  const loadingBuffers = useRef<Record<string, Promise<AudioBuffer>>>({});
  const activeSources = useRef<Record<string, AudioBufferSourceNode>>({});
  const previewSource = useRef<AudioBufferSourceNode | null>(null);
  const transportStep = useRef(-1);
  const audio = useRef<AudioContext | null>(null);
  const activePad = pads.find((pad) => pad.id === selected) ?? pads[0];
  const soloed = pads.some((pad) => pad.solo);
  const visibleSamples = liveSamples.filter((name) => { const lower = name.toLowerCase(); const matchesQuery = lower.includes(sampleQuery.trim().toLowerCase()); const matchesCategory = sampleCategory === "all" || (sampleCategory === "drums" && /(kick|snare|hat|shaker|clap|perc|cymbal)/.test(lower)) || (sampleCategory === "bass" && /(808|bass|sub)/.test(lower)) || (sampleCategory === "vocal" && /(vox|vocal|voice)/.test(lower)) || (sampleCategory === "fx" && /(fx|riser|impact|crash|fill)/.test(lower)); return matchesQuery && matchesCategory; });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ems.beat-machine.session.v2");
      if (!raw) return;
      const saved = JSON.parse(raw) as { banks?: Record<string, Pad[]>; activeBank?: number; bpm?: number; patternLength?: number; patternChain?: number[]; swing?: number; patternName?: string; savedPatterns?: Record<string, unknown>; exportHistory?: Array<{ id: string; kind: string; createdAt: string; fileName: string; status: string }> };
      if (saved.banks && typeof saved.banks === "object") {
        setPadBanks(Object.fromEntries(Object.entries(saved.banks).map(([bank, bankPads]) => [
          Number(bank),
          bankPads.map((pad) => ({ ...pad, sampleAsset: pad.sampleAsset })),
        ])));
      }
      if (saved.activeBank === 0 || saved.activeBank === 1 || saved.activeBank === 2 || saved.activeBank === 3) setPadBank(saved.activeBank);
      if (typeof saved.bpm === "number" && saved.bpm >= 40 && saved.bpm <= 240) setBpm(saved.bpm);
      if (saved.patternLength === 8 || saved.patternLength === 16) setPatternLength(saved.patternLength);
      if (typeof saved.swing === "number") setSwing(Math.max(0, Math.min(75, saved.swing)));
      if (Array.isArray(saved.exportHistory)) setExportHistory(saved.exportHistory as Array<{ id: string; kind: string; createdAt: string; fileName: string; status: string }>);
      if (typeof saved.patternName === "string") setPatternName(saved.patternName);
      if (saved.savedPatterns && typeof saved.savedPatterns === "object") setSavedPatterns(saved.savedPatterns as Record<string, unknown>);
      if (Array.isArray(saved.patternChain) && saved.patternChain.every((bank) => Number.isInteger(bank) && bank >= 0 && bank <= 3)) setPatternChain(saved.patternChain.length ? saved.patternChain : [0]);
    } catch {
      localStorage.removeItem("ems.beat-machine.session.v2");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ems.beat-machine.session.v2", JSON.stringify({
      banks: padBanks,
      activeBank: padBank,
      bpm,
      patternLength,
      patternChain,
    }));
  }, [padBanks, padBank, bpm, patternLength, patternChain, swing, patternName, savedPatterns]);

  function context() { const ctx = getStudioAudioContext(); audio.current = ctx; return ctx; }
  async function assignDecodedSample(name: string, buffer: AudioBuffer) {
    sampleBuffers.current[name] = buffer;
    setSampleName(name);
    setSampleWaveform(readWaveform(buffer));
    sampleBuffers.current[padBank + ":" + selected] = buffer;
    updatePad(selected, { sampleAsset: name });
    trigger({ ...activePad, id: selected, sampleAsset: name });
  }
  async function loadDroppedFile(file: File) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const ctx = context();
      await resumeStudioAudio();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      await assignDecodedSample(file.name, buffer);
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : "Could not decode dropped audio");
    } finally {
      setSampleLoading(false);
      setDragOver(false);
    }
  }
  function resolveSampleUrl(name: string) { return sampleUrls.current[name] ?? sampleUrl(name); }
  async function loadSample(name: string) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const ctx = context();
      await resumeStudioAudio();
      if (!sampleBuffers.current[name]) {
        const response = await fetch(resolveSampleUrl(name));
        if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`);
        sampleBuffers.current[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      setSampleName(name);
      setSampleWaveform(readWaveform(sampleBuffers.current[name]));
      sampleBuffers.current[padBank + ":" + selected] = sampleBuffers.current[name];
      updatePad(selected, { sampleAsset: name });
      trigger({ ...activePad, id: selected, sampleAsset: name });
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : `Could not load ${name}`);
    } finally {
      setSampleLoading(false);
    }
  }
  async function previewSample(name: string) {
    setSampleLoading(true);
    setSampleError(null);
    try {
      const ctx = context();
      await resumeStudioAudio();
      if (!sampleBuffers.current[name]) {
        const response = await fetch(resolveSampleUrl(name));
        if (!response.ok) throw new Error(`Could not preview ${name} (${response.status})`);
        sampleBuffers.current[name] = await ctx.decodeAudioData(await response.arrayBuffer());
      }
      setSampleWaveform(readWaveform(sampleBuffers.current[name]));
      previewSource.current?.stop();
      const source = registerStudioSource(ctx.createBufferSource());
      const gain = ctx.createGain();
      previewSource.current = source;
      source.onended = () => {
        if (previewSource.current === source) previewSource.current = null;
      };
      source.buffer = sampleBuffers.current[name];
      gain.gain.value = 0.6;
      source.connect(gain).connect(ctx.destination);
      source.start();
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : `Could not preview ${name}`);
    } finally {
      setSampleLoading(false);
    }
  }
  async function refreshSampleLibrary() {
    setSampleLibraryLoading(true);
    try {
      type LibraryPage = { sounds?: Array<{ name?: string; path?: string; url?: string; source?: "kit" | "factory"; bucket?: string }>; nextCursor?: number | null };
      const all: LibraryPage["sounds"] = [];
      let cursor: number | null = 0;
      do {
        const query = cursor ? `&cursor=${cursor}` : "";
        const response = await fetch(`/api/studio/sounds/library?limit=100${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Library request failed (${response.status})`);
        const payload = await response.json() as LibraryPage;
        all.push(...(payload.sounds ?? []));
        cursor = payload.nextCursor ?? null;
      } while (cursor !== null);
      const names = all
        .map((sound) => { const name = sound.path ?? sound.name; if (name && sound.url) sampleUrls.current[name] = sound.url; if (name) sampleSources.current[name] = sound.source ?? (sound.bucket === "studio-kits" ? "kit" : "factory"); return name; })
        .filter((name): name is string => Boolean(name && /\.(wav|mp3|ogg|m4a|flac|aif|aiff|webm)$/i.test(name)));
      setLiveSamples(Array.from(new Set([...LIVE_SAMPLE_NAMES, ...names])));
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : "Could not refresh the sound library.");
      if (!liveSamples.length) setLiveSamples(LIVE_SAMPLE_NAMES);
      // Keep the last known library visible during a transient network error.
    } finally {
      setSampleLibraryLoading(false);
    }
  }
  useEffect(() => { void refreshSampleLibrary(); }, []);
  async function trigger(pad: Pad, velocity = 1) {
    if (pad.muted || (soloed && !pad.solo)) return;
    let ctx: AudioContext;
    try {
      ctx = context();
      await resumeStudioAudio();
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : "Web Audio could not start in this browser.");
      return;
    }
    const sourceKey = padBank + ":" + pad.id;
    activeSources.current[sourceKey]?.stop();
    let buffer = sampleBuffers.current[sourceKey];
    if (!buffer && pad.sampleAsset) {
      try {
        const pending = loadingBuffers.current[sourceKey] ?? (async () => {
          // Reuse the signed URL returned by the authenticated library scan.
          // Falling back to a public Supabase URL makes private kit assets fail.
          const response = await fetch(resolveSampleUrl(pad.sampleAsset!));
          if (!response.ok) throw new Error(`Could not reload ${pad.sampleAsset} (${response.status})`);
          return ctx.decodeAudioData(await response.arrayBuffer());
        })();
        loadingBuffers.current[sourceKey] = pending;
        buffer = await pending;
        sampleBuffers.current[sourceKey] = buffer;
      } catch (error) {
        setSampleError(error instanceof Error ? error.message : `Could not reload ${pad.sampleAsset}`);
        return;
      } finally {
        delete loadingBuffers.current[sourceKey];
      }
    }
    const now = ctx.currentTime;
    if (buffer) {
      const source = registerStudioSource(ctx.createBufferSource());
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = (pad.id === "bass" ? 0.85 : 1) * Math.pow(2, (pad.tune ?? 0) / 12);
      source.loop = pad.mode === "loop";
      gain.gain.value = Math.max(0.001, (pad.volume / 100) * velocity * 0.55);
      pan.pan.value = Math.max(-1, Math.min(1, pad.pan / 50));
      source.connect(gain).connect(pan).connect(ctx.destination);
      activeSources.current[sourceKey] = source;
      source.onended = () => {
        if (activeSources.current[sourceKey] === source) delete activeSources.current[sourceKey];
      };
      source.start(now, pad.sliceStart ?? 0, pad.sliceDuration);
      if (pad.mode === "loop") source.stop(now + Math.max(0.25, Math.min(8, buffer.duration)));
      return;
    }
    // Real sample playback is required. An empty pad stays silent until the producer loads a Supabase asset.
    return;
  }
  function updatePad(id: string, patch: Partial<Pad>) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, ...patch } : pad)); }
  function clearPad(id: string) { updatePad(id, { sampleAsset: undefined, sliceStart: undefined, sliceDuration: undefined }); delete sampleBuffers.current[padBank + ":" + id]; }
  function tapTempo() { const now = Date.now(); tapTimes.current = [...tapTimes.current.filter((time) => now - time < 3000), now].slice(-6); if (tapTimes.current.length > 1) { const intervals = tapTimes.current.slice(1).map((time, index) => time - tapTimes.current[index]); setBpm(Math.max(40, Math.min(240, Math.round(60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length))))); } }
  function savePattern() { setSavedPatterns((current) => ({ ...current, [patternName || "Untitled Pattern"]: { banks: padBanks, bpm, patternLength, patternChain, swing } })); }
  function loadPattern(name: string) { const saved = savedPatterns[name] as { banks?: Record<number, Pad[]>; bpm?: number; patternLength?: 8 | 16; patternChain?: number[]; swing?: number } | undefined; if (!saved) return; if (saved.banks) setPadBanks(saved.banks); if (saved.bpm) setBpm(saved.bpm); if (saved.patternLength) setPatternLength(saved.patternLength); if (saved.patternChain) setPatternChain(saved.patternChain); if (typeof saved.swing === "number") setSwing(saved.swing); }
  function toggleStep(id: string, index: number) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, steps: pad.steps.map((on, i) => i === index ? !on : on) } : pad)); }
  function stop() { trackStudio("beat_pattern_stopped", { bpm }); Object.values(activeSources.current).forEach((source) => { try { source.stop(); } catch {} }); activeSources.current = {}; try { previewSource.current?.stop(); } catch {} previewSource.current = null; stopAllStudioAudio(); studioTransport.stop(true); transportStep.current = -1; setPlaying(false); setStep(0); }
  useEffect(() => () => {
    Object.values(activeSources.current).forEach((source) => { try { source.stop(); } catch {} });
    activeSources.current = {};
    try { previewSource.current?.stop(); } catch {}
    previewSource.current = null;
    studioTransport.stop(true);
  }, []);
  async function play() {
    if (playing) { trackStudio("beat_pattern_stopped", { bpm }); stop(); return; }
    if (!pads.some((pad) => pad.steps.some(Boolean))) {
      setSampleError('Pattern is empty. Tap steps in the grid first, or tap a pad to audition its sound.');
      return;
    }
    setSampleError(null);
    transportStep.current = -1;
    setStep(0);
    try {
      await context().resume();
    } catch (error) {
      setSampleError(error instanceof Error ? error.message : "Web Audio could not start in this browser.");
      return;
    }
    studioTransport.setBpm(bpm);
    studioTransport.play();
    setPlaying(true);
  }
  function randomize() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map((_, i) => i === 0 || Math.random() > (pad.id === "hat" ? 0.45 : 0.76)) }))); }
  function clearPattern() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map(() => false) }))); }
  function applyPreset(preset: Preset) { setPads((current) => current.map((pad) => ({ ...pad, volume: preset.volumes[pad.id] ?? pad.volume, pan: preset.pans[pad.id] ?? pad.pan }))); }
  function cancelExport() { exportAbort.current?.abort(); exportAbort.current = null; setPrinting(false); setExportStatus("Export cancelled"); setExportProgress(0); }
  async function exportAudio(kind: "stems" | "master" | "selected" | "mp3") {
    if (printing) return;
    const controller = new AbortController();
    exportAbort.current = controller;
    trackStudio("beat_export_started", { format: kind, pattern_length: patternLength });
    setPrinting(true);
    setExportProgress(5);
    setExportStatus("Rendering audio…");
    setSampleError(null);
    try {
      const plans = buildBeatStemRenderPlan(pads, bpm);
      if (!plans.length) throw new Error("Add at least one step before printing to Studio.");
      const stems: PrintedBeatStem[] = await Promise.all(plans.filter((stem) => kind !== "selected" || stem.id === selected).map(async (stem) => ({
        ...stem,
        blob: await renderBeatStem(stem, pads.find((pad) => pad.id === stem.id), sampleBuffers.current[padBank + ":" + stem.id]),
        name: stem.id,
        kind: stem.id === "bass" ? "bass" as const : stem.id === "vox" ? "vocal" as const : stem.id === "fx" ? "fx" as const : "drum" as const,
      })));
      if (controller.signal.aborted) throw new Error("Export cancelled");
      setExportProgress(70);
      const validStems = stems.filter((stem) => validateWav(stem.blob));
      if (validStems.length !== stems.length) throw new Error("Export validation failed: invalid WAV header or empty file.");
      if (kind === "stems") validStems.forEach((stem) => { const url = URL.createObjectURL(stem.blob); const link = document.createElement("a"); link.href = url; link.download = stem.fileName; link.click(); URL.revokeObjectURL(url); });
      const busSettings = Object.fromEntries(Array.from(new Set(pads.map((pad) => pad.busId ?? "master"))).map((busId) => { const busPads = pads.filter((pad) => (pad.busId ?? "master") === busId); return [busId, { volume: Math.max(0, Math.min(2, (busPads.reduce((sum, pad) => sum + (pad.busVolume ?? 100), 0) / Math.max(1, busPads.length)) / 100)), pan: busPads.reduce((sum, pad) => sum + (pad.busPan ?? 0), 0) / Math.max(1, busPads.length) / 50 }]; }));
      const master = await mixWavBlobs(validStems.map((stem) => stem.blob), busSettings);
      if (!validateWav(master)) throw new Error("Master export validation failed.");
      const masterBuffer = await getStudioAudioContext().decodeAudioData(await master.arrayBuffer());
      const exportBlob = kind === "mp3" ? audioBufferToMp3(masterBuffer) : master;
      if (kind === "master" || kind === "mp3") { const url = URL.createObjectURL(exportBlob); const link = document.createElement("a"); link.href = url; link.download = kind === "mp3" ? "Epic-Music-Space-Master.mp3" : "Epic-Music-Space-Master.wav"; link.click(); URL.revokeObjectURL(url); }
      setExportProgress(100);
      const historyEntry = { id: `${Date.now()}-${kind}`, kind, createdAt: new Date().toISOString(), fileName: kind === "master" ? "Epic-Music-Space-Master.wav" : `Epic-Music-Space-${kind}.wav`, status: "success" };
      setExportHistory((current) => [historyEntry, ...current].slice(0, 20));
      setExportStatus(`${kind === "stems" ? "Stems" : "Master WAV"} exported; peak normalized below -1 dBFS`);
      if (onPrintToStudio) {
        await onPrintToStudio(stems);
      } else {
        window.dispatchEvent(new CustomEvent("ems:beat-stems-to-session", { detail: { stems, autoMix: true } }));
      }
      trackStudio("print_to_studio_succeeded", { stem_count: stems.length });
      setPrintStatus(`Printed ${stems.length} stems to Studio`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Beat Machine stems could not be rendered.";
      setPrintStatus("Print failed");
      setSampleError(message);
    } finally {
      setPrinting(false);
      exportAbort.current = null;
    }
  }
  async function sendToStudio() { await exportAudio("stems"); }
  function exportPattern() {
    trackStudio("beat_export_started", { format: "json", pattern_length: patternLength });
    download("ems-beat-pattern.json", JSON.stringify({
      version: 3,
      effectsAware: true,
      busSettings: Object.fromEntries(pads.map((pad) => [pad.id, { busId: pad.busId ?? "master", busVolume: pad.busVolume ?? 100, busPan: pad.busPan ?? 0, insertEffects: pad.insertEffects ?? [], reverbSend: pad.reverbSend ?? 0, delaySend: pad.delaySend ?? 0, automation: pad.automation ?? {}}])),
      bpm,
      patternLength,
      activeBank: padBank,
      patternChain,
      banks: Object.fromEntries(Object.entries(padBanks).map(([bank, bankPads]) => [bank, bankPads.map(({ id, label, volume, pan, muted, solo, steps, tune, mode, sliceStart, sliceDuration, stepVelocity, stepProbability, stepPitch }) => ({ id, label, volume, pan, muted, solo, steps, tune, mode, sliceStart, sliceDuration, stepVelocity, stepProbability, stepPitch }))])),
    }, null, 2));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") { event.preventDefault(); play(); return; }
      const pad = pads.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (!pad) return;
      event.preventDefault();
      setSelected(pad.id);
      trigger(pad);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  useEffect(() => {
    studioTransport.setBpm(bpm);
    return studioTransport.subscribe((state) => {
      const baseStepDuration = 60 / bpm / 4;
       const nextStep = Math.floor(state.positionSec / baseStepDuration) % patternLength;
      if (!state.playing || nextStep === transportStep.current) return;
      if (nextStep === 0 && transportStep.current === patternLength - 1 && patternChain.length > 1) {
        chainPosition.current = (chainPosition.current + 1) % patternChain.length;
        setPadBank(patternChain[chainPosition.current] ?? 0);
      }
      transportStep.current = nextStep;
      setStep(nextStep);
      pads.forEach((pad) => { const muted = pad.stepMuted?.[nextStep]; if (pad.steps[nextStep] && !muted && Math.random() <= (pad.stepProbability?.[nextStep] ?? 100) / 100) { const hits = Math.max(1, Math.min(4, pad.stepRatchet?.[nextStep] ?? 1)); for (let repeat = 0; repeat < hits; repeat += 1) void trigger({ ...pad, tune: (pad.tune ?? 0) + (pad.stepPitch?.[nextStep] ?? 0), pan: pad.stepPan?.[nextStep] ?? pad.pan, sliceStart: pad.stepReverse?.[nextStep] ? undefined : pad.sliceStart }, 0.88 * ((pad.stepVelocity?.[nextStep] ?? 100) / 100)); } });
      setPlaying(true);
    });
  }, [bpm, pads, patternLength]);

  return <div className={cn(studioMode ? "h-full" : "min-h-screen", "min-h-0 overflow-hidden bg-[#0b0d10] text-white")}>
    <div className="grid h-full min-h-0 grid-rows-[34px_1fr]">
      <div className="flex h-[34px] items-center border-b border-black bg-[#202329] text-[11px] uppercase tracking-[0.14em] text-white/70">
        <div className="flex h-full items-center border-r border-black px-4 font-black text-cyan-200">Beat Machine</div>
        <div className="flex h-full items-center border-r border-black">
          {[0, 1, 2, 3].map((bank) => <button key={bank} onClick={() => setPadBank(bank)} className={cn("h-full px-3 font-black", padBank === bank ? "bg-cyan-300 text-black" : "bg-[#30343b] text-white/60")}>Bank {bank + 1}</button>)}
        </div>
        <button onClick={play} className={cn("h-full border-r border-black px-5 font-black", playing ? "bg-red-500 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
        <button onClick={stop} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Reset</button>
        <button onClick={randomize} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Generate</button>
        <button onClick={clearPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Clear</button>
        <button onClick={() => void exportAudio("mp3")} disabled={printing} className="h-full border-r border-black bg-cyan-300 px-4 font-black text-black disabled:opacity-60">{printing ? `${exportProgress}%` : "Export MP3"}</button>
        <div className="flex h-full items-center border-r border-black"><span className="px-2 text-[9px] text-white/40">LENGTH</span>{([8, 16] as const).map((length) => <button key={length} onClick={() => setPatternLength(length)} className={cn("h-full px-2 font-black", patternLength === length ? "bg-purple-300 text-black" : "bg-[#30343b] text-white/60")}>{length}</button>)}</div>
        <button onClick={() => setPatternChain((current) => [...current, padBank])} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Chain B{padBank + 1}</button><button onClick={() => { setPatternChain([0]); chainPosition.current = 0; }} className="h-full border-r border-black bg-[#30343b] px-3 font-black">Clear Chain</button><input value={patternName} onChange={(event) => setPatternName(event.target.value)} aria-label="Pattern name" className="h-full w-28 border-l border-black bg-black px-2 font-mono text-[10px] text-cyan-200" /><button onClick={savePattern} className="h-full border-l border-black bg-[#30343b] px-3 font-black">Save</button><select aria-label="Load pattern" value="" onChange={(event) => loadPattern(event.target.value)} className="h-full border-l border-black bg-[#30343b] px-2 text-[10px]"><option value="">Load</option>{Object.keys(savedPatterns).map((name) => <option key={name} value={name}>{name}</option>)}</select><button onClick={() => void exportAudio("stems")} disabled={printing} className="h-full border-l border-black bg-[#30343b] px-3 font-black">Export Stems</button><button onClick={cancelExport} disabled={!printing} className="h-full border-l border-black bg-red-500 px-3 font-black text-black disabled:opacity-40">Cancel</button><button onClick={exportPattern} className="h-full border-r border-black bg-[#30343b] px-4 font-black">Export</button>
        <button onClick={tapTempo} className="h-full border-l border-black bg-[#30343b] px-3 font-black">Tap</button><label className="flex h-full items-center border-l border-black px-3 font-black">BPM <input value={bpm} type="number" min="40" max="240" onChange={(event) => setBpm(Math.max(40, Math.min(240, Number(event.target.value) || 120)))} className="ml-2 w-16 bg-black px-2 py-1 font-mono text-cyan-200 outline-none" /></label><label className="flex h-full items-center border-l border-black px-3 font-black">Swing <input value={swing} type="range" min="0" max="75" onChange={(event) => setSwing(Number(event.target.value))} className="ml-2 w-16 accent-cyan-300" /></label>
      </div>
      <main className="grid min-h-0 grid-cols-[360px_1fr] overflow-hidden">
        <section className="min-h-0 overflow-auto border-r border-black bg-[#111418] p-3">
          <div className="grid grid-cols-4 gap-2">
            {pads.map((pad) => <button key={pad.id} aria-label={`Play ${pad.label} pad${pad.sampleAsset ? `, ${pad.sampleAsset}` : ""}`} onClick={() => { setSelected(pad.id); trigger(pad); }} className="relative aspect-square border bg-gradient-to-b from-[#2c2d2f] to-[#101112] p-2" style={{ borderColor: selected === pad.id ? pad.color : "rgba(255,255,255,.16)", boxShadow: selected === pad.id ? `0 0 16px ${pad.color}55` : "inset 0 1px 0 rgba(255,255,255,.08)" }}><span className="grid h-full place-items-center text-[12px] font-black tracking-[0.08em]">{pad.label}</span><span className={cn("absolute left-2 top-2 text-[8px] font-black uppercase", sampleBuffers.current[padBank + ":" + pad.id] || pad.sampleAsset ? "text-green-300" : "text-white/35")}>{sampleBuffers.current[padBank + ":" + pad.id] ? "Loaded" : pad.sampleAsset ? "Ready" : "Empty"}</span>{pad.sampleAsset && <span className="absolute bottom-2 left-2 max-w-[72%] truncate text-[8px] font-mono text-white/45">{pad.sampleAsset.replace(/\.(wav|mp3|ogg|m4a|flac)$/i, "")}</span>}<span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/40">{pad.key}</span></button>)}
          </div>
          <div onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void loadDroppedFile(file); }} className={cn("mt-4 border-t border-white/10 pt-4", dragOver && "rounded border border-cyan-300 bg-cyan-300/10")}>
            <div className="mb-3 flex items-center justify-between">
              <b className="text-[11px] uppercase tracking-widest text-cyan-200">Live Sample Library</b>
              <div className="flex items-center gap-2"><span className="font-mono text-[10px] text-white/35">{visibleSamples.length}/{liveSamples.length} sounds</span><button onClick={() => void refreshSampleLibrary()} disabled={sampleLibraryLoading} aria-label="Refresh sound library" className="border border-cyan-300/30 px-2 py-1 text-[9px] font-black uppercase text-cyan-200 disabled:opacity-50">{sampleLibraryLoading ? "Loading" : "Refresh"}</button></div>
            </div>
            <input value={sampleQuery} onChange={(event) => setSampleQuery(event.target.value)} placeholder="Search kits and samples..." aria-label="Search kits and samples" className="mb-2 w-full border border-cyan-300/20 bg-black/40 px-2 py-2 text-[10px] uppercase text-cyan-100 outline-none placeholder:text-white/30" />{sampleQuery && <button onClick={() => setSampleQuery("")} className="mb-2 text-[8px] font-black uppercase text-cyan-200">Clear search</button>}
            <div className="mb-2 flex flex-wrap gap-1">{(["all", "drums", "bass", "vocal", "fx"] as const).map((category) => <button key={category} onClick={() => setSampleCategory(category)} className={cn("border px-2 py-1 text-[8px] font-black uppercase", sampleCategory === category ? "border-cyan-200 bg-cyan-300/20 text-cyan-100" : "border-white/10 text-white/45")}>{category}</button>)}</div>
            <div aria-busy={sampleLibraryLoading} className="max-h-52 space-y-1 overflow-auto pr-1">{sampleLibraryLoading && <p className="px-2 py-3 text-[9px] font-bold uppercase text-cyan-200">Loading Supabase sounds…</p>} {!sampleLibraryLoading && visibleSamples.length === 0 && <p className="px-2 py-3 text-[9px] font-bold uppercase text-white/45">No sounds match this filter.</p>}
              {visibleSamples.map((name) => (
                <div key={name} className="flex gap-1">
                  <button onClick={() => void previewSample(name)} disabled={sampleLoading} className="min-w-0 flex-1 truncate border border-white/10 bg-black/25 px-2 py-2 text-left text-[10px] font-bold uppercase text-white/60 hover:border-cyan-300/60 hover:text-white"><span className="mr-2 rounded border border-white/15 px-1 text-[8px] text-white/45">{sampleSources.current[name] === "kit" ? "KIT" : "SAMPLE"}</span>{name.replace(/\.(wav|mp3|ogg|m4a)$/i, "")}</button>
                  <button onClick={() => void loadSample(name)} disabled={sampleLoading} className="shrink-0 border border-cyan-300/40 px-2 text-[9px] font-black text-cyan-200 disabled:opacity-50">LOAD</button>
                </div>
              ))}
            </div>
            {sampleLoading && <p role="status" className="mt-2 text-[9px] font-bold uppercase text-cyan-200">Loading sample…</p>}
            {sampleError && <p role="alert" className="mt-2 text-[9px] font-bold uppercase text-red-300">{sampleError}</p>}
            {sampleWaveform.length > 0 && (
              <div className="mt-3 flex h-12 items-center gap-px border border-cyan-300/20 bg-black/40 px-2" aria-label="Decoded sample waveform">
                {sampleWaveform.map((peak, index) => <span key={index} className="flex-1 bg-cyan-300/80" style={{ height: `${Math.max(8, peak * 100)}%` }} />)}
              </div>
            )}
            {sampleSlices.length > 0 && <div className="mt-2 grid grid-cols-4 gap-1"><span className="col-span-4 text-[9px] font-black uppercase text-white/40">Slices · assign to selected pad</span>{sampleSlices.map((slice) => <button key={slice.index} onClick={() => { updatePad(activePad.id, { sliceStart: slice.start, sliceDuration: slice.duration }); setSampleName(`${sampleName ?? "Sample"} · Slice ${slice.index + 1}`); trigger({ ...activePad, sliceStart: slice.start, sliceDuration: slice.duration }); }} className="border border-purple-300/30 px-1 py-1 text-[9px] font-black text-purple-200">S{slice.index + 1}</button>)}</div>}
            <p className="mt-1 text-[9px] leading-4 text-white/35">{printStatus} {exportStatus}</p><div className="mt-2 border-t border-white/10 pt-2"><b className="text-[9px] uppercase text-cyan-200">Export history</b>{exportHistory.length === 0 ? <p className="mt-1 text-[9px] text-white/35">No exports yet.</p> : exportHistory.slice(0, 5).map((entry) => <button key={entry.id} onClick={() => download("ems-export-history.json", JSON.stringify(exportHistory, null, 2))} className="mt-1 block w-full truncate text-left text-[9px] text-white/50 hover:text-cyan-100">{entry.kind} · {entry.status} · {new Date(entry.createdAt).toLocaleTimeString()}</button>)}</div><p className="mt-2 text-[9px] leading-4 text-white/35">Samples load from Supabase Storage and replace the selected pad sound. Tap a pad, then load a sound.</p><p className="mt-1 text-[9px] font-bold uppercase text-cyan-200">Drag an audio file here to load it onto the selected pad.</p>{sampleName && <p className="mt-1 truncate text-[9px] font-bold uppercase text-green-300">Loaded to {activePad.label}: {sampleName}</p>}
          </div>
          <div className="mt-4 border-t border-white/10 pt-4">
            <b className="block text-xl" style={{ color: activePad.color }}>{activePad.label}</b>
            <div className="mt-3 space-y-3">
              <label className="block text-[10px] font-black uppercase text-white/55">Playback mode<select value={activePad.mode ?? "one-shot"} onChange={(event) => updatePad(activePad.id, { mode: event.target.value as "one-shot" | "loop" })} className="mt-2 w-full bg-black px-2 py-2 text-cyan-200"><option value="one-shot">One-shot</option><option value="loop">Loop</option></select></label>
              <label className="block text-[10px] font-black uppercase text-white/55">Tune (semitones)<input className="mt-2 w-full accent-cyan-300" type="range" min="-24" max="24" value={activePad.tune ?? 0} onChange={(event) => updatePad(activePad.id, { tune: Number(event.target.value) })} /></label>
              <div className="border-t border-white/10 pt-3"><b className="text-[10px] uppercase text-yellow-200">Step {selectedStep + 1} controls</b><label className="mt-2 block text-[10px] font-black uppercase text-white/55">Velocity<input className="mt-2 w-full accent-yellow-300" type="range" min="0" max="100" value={activePad.stepVelocity?.[selectedStep] ?? 100} onChange={(event) => updatePad(activePad.id, { stepVelocity: Object.assign(Array.from({ length: 16 }, (_, index) => activePad.stepVelocity?.[index] ?? 100), { [selectedStep]: Number(event.target.value) }) })} /></label><label className="mt-2 block text-[10px] font-black uppercase text-white/55">Probability<input className="mt-2 w-full accent-yellow-300" type="range" min="0" max="100" value={activePad.stepProbability?.[selectedStep] ?? 100} onChange={(event) => updatePad(activePad.id, { stepProbability: Object.assign(Array.from({ length: 16 }, (_, index) => activePad.stepProbability?.[index] ?? 100), { [selectedStep]: Number(event.target.value) }) })} /></label><label className="mt-2 block text-[10px] font-black uppercase text-white/55">Pan<input className="mt-2 w-full accent-yellow-300" type="range" min="-50" max="50" value={activePad.stepPan?.[selectedStep] ?? activePad.pan} onChange={(event) => updatePad(activePad.id, { stepPan: Object.assign(Array.from({ length: 16 }, (_, index) => activePad.stepPan?.[index] ?? activePad.pan), { [selectedStep]: Number(event.target.value) }) })} /></label><label className="mt-2 block text-[10px] font-black uppercase text-white/55">Pitch<input className="mt-2 w-full accent-yellow-300" type="range" min="-24" max="24" value={activePad.stepPitch?.[selectedStep] ?? 0} onChange={(event) => updatePad(activePad.id, { stepPitch: Object.assign(Array.from({ length: 16 }, (_, index) => activePad.stepPitch?.[index] ?? 0), { [selectedStep]: Number(event.target.value) }) })} /></label></div>
              {(["volume", "pan", "freq"] as const).map((field) => <label key={field} className="block text-[10px] font-black uppercase text-white/55">{field}<input className="mt-2 w-full accent-cyan-300" type="range" min={field === "pan" ? -50 : field === "freq" ? 30 : 0} max={field === "pan" ? 50 : field === "freq" ? 8000 : 100} value={activePad[field]} onChange={(event) => updatePad(activePad.id, { [field]: Number(event.target.value) })} /></label>)}
              <div className="flex gap-2"><button onClick={() => updatePad(activePad.id, { muted: !activePad.muted })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.muted && "bg-red-400 text-black")}>Mute</button><button onClick={() => updatePad(activePad.id, { solo: !activePad.solo })} className={cn("h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase", activePad.solo && "bg-yellow-300 text-black")}>Solo</button><button onClick={() => clearPad(activePad.id)} className="h-8 flex-1 border border-black bg-[#30343b] text-[10px] font-black uppercase">Clear</button><button onClick={() => trigger(activePad)} className="h-8 flex-1 border border-black bg-cyan-300 text-[10px] font-black uppercase text-black">Test</button></div>
              <div className="grid gap-2 pt-2">{presets.map((preset) => <button key={preset.name} onClick={() => applyPreset(preset)} className="border border-white/10 bg-black/35 px-3 py-2 text-left text-[10px] font-black uppercase tracking-widest text-white/65 hover:text-cyan-100">{preset.name}</button>)}</div>
            </div>
          </div>
        </section>
        <section className="min-h-0 overflow-auto bg-[#15191d] p-4">
          <div className="w-full space-y-1.5">
            {pads.map((pad) => <div key={pad.id} className="grid items-center gap-1" style={{ gridTemplateColumns: `clamp(48px,7vw,72px) repeat(${patternLength},minmax(0,1fr))` }}><button onClick={() => setSelected(pad.id)} className="truncate border-r border-white/10 pr-1 text-left font-mono text-[9px] uppercase" style={{ color: selected === pad.id ? pad.color : "rgba(255,255,255,.55)" }}>{pad.label}</button>{pad.steps.slice(0, patternLength).map((on, i) => <button key={i} aria-label={`${pad.label} step ${i + 1}`} onClick={() => { setSelectedStep(i); toggleStep(pad.id, i); }} className={cn("h-8 min-w-0 border", step === i && "ring-1 ring-white/60", selectedStep === i && "outline outline-1 outline-cyan-300")} style={{ backgroundColor: on ? pad.color : "rgba(255,255,255,.035)", borderColor: on ? pad.color : "rgba(255,255,255,.08)", boxShadow: on ? `0 0 8px ${pad.color}80` : undefined }} />)}</div>)}
          </div>
        </section>
      </main>
    </div>
  </div>;
}

