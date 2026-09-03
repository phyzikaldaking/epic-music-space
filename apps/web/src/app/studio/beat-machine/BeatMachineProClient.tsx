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
  { id: "kick", label: "KICK", key: "1", color: "#20f7ff", freq: 54, volume: 88, pan: 0, muted: false, solo: false, steps: makeSteps([1, 7, 11]) },
  { id: "snare", label: "SNARE", key: "2", color: "#ff31df", freq: 180, volume: 74, pan: 0, muted: false, solo: false, steps: makeSteps([5, 13]) },
  { id: "hat", label: "CLOSED HAT", key: "3", color: "#a75cff", freq: 6500, volume: 48, pan: 14, muted: false, solo: false, steps: makeSteps([1, 3, 5, 7, 9, 11, 13, 15]) },
  { id: "clap", label: "CLAP", key: "4", color: "#ff7adf", freq: 260, volume: 60, pan: -8, muted: false, solo: false, steps: makeSteps([5, 13]) },
  { id: "bass", label: "808", key: "Q", color: "#f2c85b", freq: 42, volume: 82, pan: 0, muted: false, solo: false, steps: makeSteps([1, 7, 11, 15]) },
  { id: "perc", label: "PERC", key: "W", color: "#16e59a", freq: 410, volume: 55, pan: 18, muted: false, solo: false, steps: makeSteps([4, 12]) },
  { id: "openhat", label: "OPEN HAT", key: "E", color: "#7c8cff", freq: 5200, volume: 52, pan: -14, muted: false, solo: false, steps: makeSteps([9]) },
  { id: "rim", label: "RIM", key: "R", color: "#ff9868", freq: 720, volume: 50, pan: 20, muted: false, solo: false, steps: makeSteps([]) },
  { id: "tom", label: "TOM", key: "A", color: "#3ce0c5", freq: 130, volume: 62, pan: -18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "shaker", label: "SHAKER", key: "S", color: "#9fdd65", freq: 7600, volume: 38, pan: 22, muted: false, solo: false, steps: makeSteps([2, 6, 10, 14]) },
  { id: "crash", label: "CRASH", key: "D", color: "#ffc857", freq: 2400, volume: 44, pan: -10, muted: false, solo: false, steps: makeSteps([1]) },
  { id: "chant", label: "CHANT", key: "F", color: "#f778ba", freq: 300, volume: 48, pan: 12, muted: false, solo: false, steps: makeSteps([]) },
  { id: "sample1", label: "SAMPLE 1", key: "Z", color: "#5ee1ff", freq: 440, volume: 56, pan: -20, muted: false, solo: false, steps: makeSteps([]) },
  { id: "sample2", label: "SAMPLE 2", key: "X", color: "#8c7dff", freq: 520, volume: 56, pan: 20, muted: false, solo: false, steps: makeSteps([]) },
  { id: "vox", label: "VOX", key: "C", color: "#20c8ff", freq: 330, volume: 58, pan: -18, muted: false, solo: false, steps: makeSteps([]) },
  { id: "fx", label: "FX", key: "V", color: "#ff4f8b", freq: 920, volume: 42, pan: 24, muted: false, solo: false, steps: makeSteps([]) },
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

export default function BeatMachineProClient({ studioMode = false, initialBpm = 140, onBpmChange, onOpenEdit, onPrintToStudio }: { initialView?: string; studioMode?: boolean; initialBpm?: number; onBpmChange?: (bpm: number) => void; onOpenEdit?: () => void; onPrintToStudio?: (stems: PrintedBeatStem[]) => Promise<void> | void }) {
  const [padBank, setPadBank] = useState(0);
  const [padBanks, setPadBanks] = useState<Record<number, Pad[]>>(() => ({
    0: initialPads,
    1: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    2: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
    3: initialPads.map((pad) => ({ ...pad, steps: [...pad.steps] })),
  }));
  const undoStack = useRef<Record<number, Pad[]>[]>([]);
  const redoStack = useRef<Record<number, Pad[]>[]>([]);
  const pads = padBanks[padBank] ?? initialPads;
  const setPads = (updater: (current: Pad[]) => Pad[]) => setPadBanks((current) => {
    undoStack.current = [...undoStack.current, current].slice(-40);
    redoStack.current = [];
    return { ...current, [padBank]: updater(current[padBank] ?? initialPads) };
  });
  const [selected, setSelected] = useState("kick");
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedStep, setSelectedStep] = useState(0);
  const [patternChain, setPatternChain] = useState<number[]>([0]);
  const chainPosition = useRef(0);
  const [bpm, setBpm] = useState(() => Math.max(40, Math.min(240, initialBpm)));
  const [patternLength, setPatternLength] = useState<8 | 16>(16);
  const [swing, setSwing] = useState(0);
  const [masterVolume, setMasterVolume] = useState(82);
  const [randomDensity, setRandomDensity] = useState(35);
  const [lastAction, setLastAction] = useState("Ready");
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
  const [sampleCategory, setSampleCategory] = useState<"all" | "kits" | "kicks" | "snares" | "hats" | "808s" | "loops" | "vocals" | "fx">("all");
  const [workView, setWorkView] = useState<"pads" | "sequence" | "piano" | "sample" | "mixer">("pads");
  const [sequencerExpanded, setSequencerExpanded] = useState(false);
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
  const visibleSamples = liveSamples.filter((name) => { const lower = name.toLowerCase(); const matchesQuery = lower.includes(sampleQuery.trim().toLowerCase()); const matchesCategory = sampleCategory === "all" || (sampleCategory === "kits" && /(kit|pack|bank)/.test(lower)) || (sampleCategory === "kicks" && /kick/.test(lower)) || (sampleCategory === "snares" && /(snare|clap|rim)/.test(lower)) || (sampleCategory === "hats" && /(hat|shaker|cymbal)/.test(lower)) || (sampleCategory === "808s" && /(808|bass|sub)/.test(lower)) || (sampleCategory === "loops" && /(loop|melody|chord)/.test(lower)) || (sampleCategory === "vocals" && /(vox|vocal|voice|chant)/.test(lower)) || (sampleCategory === "fx" && /(fx|riser|impact|crash|fill)/.test(lower)); return matchesQuery && matchesCategory; });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ems.beat-machine.session.v2");
      if (!raw) return;
      const saved = JSON.parse(raw) as { banks?: Record<string, Pad[]>; activeBank?: number; bpm?: number; patternLength?: number; patternChain?: number[]; swing?: number; masterVolume?: number; randomDensity?: number; patternName?: string; savedPatterns?: Record<string, unknown>; exportHistory?: Array<{ id: string; kind: string; createdAt: string; fileName: string; status: string }> };
      if (saved.banks && typeof saved.banks === "object") {
        setPadBanks(Object.fromEntries(Object.entries(saved.banks).map(([bank, bankPads]) => [
          Number(bank),
          initialPads.map((fallback) => ({ ...fallback, ...(bankPads.find((pad) => pad.id === fallback.id) ?? {}) })),
        ])));
      }
      if (saved.activeBank === 0 || saved.activeBank === 1 || saved.activeBank === 2 || saved.activeBank === 3) setPadBank(saved.activeBank);
      if (typeof saved.bpm === "number" && saved.bpm >= 40 && saved.bpm <= 240) setBpm(saved.bpm);
      if (saved.patternLength === 8 || saved.patternLength === 16) setPatternLength(saved.patternLength);
      if (typeof saved.swing === "number") setSwing(Math.max(0, Math.min(75, saved.swing)));
      if (typeof saved.masterVolume === "number") setMasterVolume(Math.max(0, Math.min(100, saved.masterVolume)));
      if (typeof saved.randomDensity === "number") setRandomDensity(Math.max(5, Math.min(90, saved.randomDensity)));
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
      swing,
      masterVolume,
      randomDensity,
      patternName,
      savedPatterns,
      exportHistory,
    }));
  }, [padBanks, padBank, bpm, patternLength, patternChain, swing, masterVolume, randomDensity, patternName, savedPatterns, exportHistory]);

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
      const response = await fetch("/api/studio/sounds/library?limit=1000", { cache: "no-store" });
      if (!response.ok) throw new Error(`Library request failed (${response.status})`);
      const payload = await response.json() as LibraryPage;
      const all = payload.sounds ?? [];
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
      gain.gain.value = Math.max(0.001, (pad.volume / 100) * (masterVolume / 100) * velocity * 0.55);
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
  function clearPad(id: string) { updatePad(id, { sampleAsset: undefined, sliceStart: undefined, sliceDuration: undefined }); delete sampleBuffers.current[padBank + ":" + id]; setSampleName(null); setSampleWaveform([]); setSampleSlices([]); setLastAction(`${id.toUpperCase()} sample cleared`); }
  function tapTempo() { const now = Date.now(); tapTimes.current = [...tapTimes.current.filter((time) => now - time < 3000), now].slice(-6); if (tapTimes.current.length > 1) { const intervals = tapTimes.current.slice(1).map((time, index) => time - tapTimes.current[index]); const next = Math.max(40, Math.min(240, Math.round(60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)))); setTempo(next); } else { setLastAction("Tap again to calculate tempo"); } }
  function savePattern() { const name = patternName.trim() || "Untitled Pattern"; setPatternName(name); setSavedPatterns((current) => ({ ...current, [name]: { banks: padBanks, bpm, patternLength, patternChain, swing } })); setLastAction(`${name} saved`); }
  function loadPattern(name: string) { const saved = savedPatterns[name] as { banks?: Record<number, Pad[]>; bpm?: number; patternLength?: 8 | 16; patternChain?: number[]; swing?: number } | undefined; if (!saved) return; if (saved.banks) setPadBanks(saved.banks); if (saved.bpm) setTempo(saved.bpm); if (saved.patternLength) setPatternLength(saved.patternLength); if (saved.patternChain) setPatternChain(saved.patternChain); if (typeof saved.swing === "number") setSwing(saved.swing); setPatternName(name); setLastAction(`${name} loaded`); }
  function toggleStep(id: string, index: number) { setPads((current) => current.map((pad) => pad.id === id ? { ...pad, steps: pad.steps.map((on, i) => i === index ? !on : on) } : pad)); setLastAction(`Toggled ${id.toUpperCase()} step ${index + 1}`); }
  function undoPattern() { const previous = undoStack.current.pop(); if (!previous) { setLastAction("Nothing to undo"); return; } redoStack.current = [...redoStack.current, padBanks].slice(-40); setPadBanks(previous); setLastAction("Pattern change undone"); }
  function redoPattern() { const next = redoStack.current.pop(); if (!next) { setLastAction("Nothing to redo"); return; } undoStack.current = [...undoStack.current, padBanks].slice(-40); setPadBanks(next); setLastAction("Pattern change restored"); }
  function shiftLane(direction: -1 | 1) { setPads((current) => current.map((pad) => pad.id !== selected ? pad : { ...pad, steps: pad.steps.map((_, index, steps) => steps[(index - direction + patternLength) % patternLength] ?? false) })); setLastAction(`${activePad.label} shifted ${direction < 0 ? "left" : "right"}`); }
  function fillLane() { setPads((current) => current.map((pad) => pad.id === selected ? { ...pad, steps: pad.steps.map((_, index) => index < patternLength) } : pad)); setLastAction(`${activePad.label} lane filled`); }
  function invertLane() { setPads((current) => current.map((pad) => pad.id === selected ? { ...pad, steps: pad.steps.map((on, index) => index < patternLength ? !on : on) } : pad)); setLastAction(`${activePad.label} lane inverted`); }
  function clearLane() { setPads((current) => current.map((pad) => pad.id === selected ? { ...pad, steps: pad.steps.map(() => false) } : pad)); setLastAction(`${activePad.label} lane cleared`); }
  function copyBankToNext() { const next = (padBank + 1) % 4; setPadBanks((current) => ({ ...current, [next]: (current[padBank] ?? initialPads).map((pad) => ({ ...pad, steps: [...pad.steps] })) })); setLastAction(`Bank ${padBank + 1} copied to Bank ${next + 1}`); }
  function setTempo(next: number) { const clamped = Math.max(40, Math.min(240, Math.round(next))); setBpm(clamped); studioTransport.setBpm(clamped); setLastAction(`Tempo set to ${clamped} BPM`); }
  function stop() { trackStudio("beat_pattern_stopped", { bpm }); Object.values(activeSources.current).forEach((source) => { try { source.stop(); } catch {} }); activeSources.current = {}; try { previewSource.current?.stop(); } catch {} previewSource.current = null; stopAllStudioAudio(); studioTransport.stop(true); transportStep.current = -1; setPlaying(false); setStep(0); setLastAction("Transport stopped and returned to zero"); }
  function stopPreview() { try { previewSource.current?.stop(); } catch {} previewSource.current = null; setLastAction("Sample preview stopped"); }
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
    stopPreview();
    studioTransport.setBpm(bpm);
    studioTransport.play();
    setPlaying(true);
    setLastAction(`Playing at ${bpm} BPM`);
  }
  function randomize() { const chance = Math.max(0.05, Math.min(0.95, randomDensity / 100)); setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map((_, i) => i < patternLength && (i === 0 || Math.random() < (pad.id === "hat" ? Math.min(0.95, chance * 1.45) : chance))) }))); setLastAction(`Generated ${randomDensity}% density pattern`); }
  function clearPattern() { setPads((current) => current.map((pad) => ({ ...pad, steps: pad.steps.map(() => false) }))); setLastAction("Pattern cleared"); }
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
      if (event.repeat || isTypingTarget(event.target) || event.altKey) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redoPattern(); else undoPattern(); return; }
      if (event.metaKey || event.ctrlKey) return;
      if (event.code === "Space") { event.preventDefault(); play(); return; }
      if (event.key === "[") { event.preventDefault(); setTempo(bpm - 1); return; }
      if (event.key === "]") { event.preventDefault(); setTempo(bpm + 1); return; }
      if (event.key === "Escape") { event.preventDefault(); stopPreview(); return; }
      if (event.key === "ArrowLeft") { event.preventDefault(); setSelectedStep((current) => (current - 1 + patternLength) % patternLength); return; }
      if (event.key === "ArrowRight") { event.preventDefault(); setSelectedStep((current) => (current + 1) % patternLength); return; }
      if (event.key === "Enter") { event.preventDefault(); toggleStep(selected, selectedStep); return; }
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
    if (studioMode) {
      onBpmChange?.(bpm);
      window.dispatchEvent(new CustomEvent("ems:studio-bpm-change", { detail: { bpm, source: "beat-machine" } }));
    }
  }, [bpm, onBpmChange, studioMode]);

  useEffect(() => {
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

  const toolTabs = [["pads", "16 Pads"], ["sequence", "Sequence"], ["piano", "808 / Piano Roll"], ["sample", "Sample Edit"], ["mixer", "Pad Mixer"]] as const;
  return <div className={cn(studioMode ? "h-full" : "min-h-screen", "min-h-0 overflow-hidden bg-[#090b0e] text-white")}>
    <div className="grid h-full min-h-0 grid-rows-[52px_44px_1fr]">
      <header className="flex min-w-0 items-center gap-3 overflow-x-auto border-b border-white/10 bg-[#15191e] px-3 [scrollbar-width:thin]">
        <strong className="mr-2 whitespace-nowrap text-sm tracking-[0.16em] text-cyan-200">EMS BEAT LAB</strong>
        <button onClick={play} className={cn("h-9 rounded-md px-5 text-sm font-black", playing ? "bg-red-500 text-white" : "bg-green-400 text-black")}>{playing ? "■ STOP" : "▶ PLAY"}</button>
        <button onClick={stop} className="h-9 rounded-md border border-white/15 px-3 text-sm font-bold text-white/70">RESET</button>
        <button onClick={tapTempo} className="h-9 rounded-md border border-white/15 px-3 text-sm font-bold">TAP</button>
        <label className="flex h-9 items-center gap-2 rounded-md bg-black/45 px-3 text-xs font-black text-white/50">BPM<input value={bpm} type="number" min="40" max="240" onChange={(event) => setTempo(Number(event.target.value) || 120)} className="w-14 bg-transparent text-base text-cyan-200 outline-none" /></label>
        <label className="flex h-9 items-center gap-2 rounded-md bg-black/45 px-3 text-xs font-black text-white/50">SWING {swing}%<input value={swing} type="range" min="0" max="75" onChange={(event) => setSwing(Number(event.target.value))} className="w-20 accent-cyan-300" /></label>
        <div className="ml-auto flex h-9 overflow-hidden rounded-md border border-white/15">{[0, 1, 2, 3].map((bank) => <button key={bank} onClick={() => setPadBank(bank)} className={cn("px-4 text-xs font-black", padBank === bank ? "bg-cyan-300 text-black" : "bg-[#242a31] text-white/55")}>PATTERN {String.fromCharCode(65 + bank)}</button>)}</div>
        <button onClick={() => void sendToStudio()} disabled={printing} className="h-9 whitespace-nowrap rounded-md bg-cyan-300 px-5 text-sm font-black text-black disabled:opacity-50">{printing ? `${exportProgress}%` : "ADD TO SONG →"}</button>
      </header>

      <nav aria-label="Beat Machine tools" className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-[#101318] px-3">
        {toolTabs.map(([id, label]) => <button key={id} onClick={() => { setWorkView(id); if (id === "sequence") setSequencerExpanded(true); }} className={cn("h-8 rounded px-4 text-xs font-black", workView === id ? "bg-white/12 text-cyan-200" : "text-white/45 hover:text-white")}>{label}</button>)}
        <span className="ml-auto whitespace-nowrap text-xs text-green-300">● URBAN STARTER KIT · READY</span>
      </nav>

      <main className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside onDragEnter={(event) => { event.preventDefault(); setDragOver(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void loadDroppedFile(file); }} className={cn("min-h-0 overflow-auto border-r border-white/10 bg-[#101318] p-3 max-lg:hidden", dragOver && "bg-cyan-300/10")}>
          <div className="mb-3 flex items-center justify-between"><strong className="text-sm">SOUND BROWSER</strong><span className="text-xs text-white/35">{liveSamples.length} sounds</span></div>
          <input value={sampleQuery} onChange={(event) => setSampleQuery(event.target.value)} placeholder="Search sounds and kits" aria-label="Search kits and samples" className="mb-3 h-10 w-full rounded border border-white/10 bg-black/40 px-3 text-sm outline-none focus:border-cyan-300" />
          <div className="mb-3 grid grid-cols-3 gap-1">{(["all", "kits", "kicks", "snares", "hats", "808s", "loops", "vocals", "fx"] as const).map((category) => <button key={category} onClick={() => setSampleCategory(category)} className={cn("rounded px-2 py-2 text-xs font-black uppercase", sampleCategory === category ? "bg-cyan-300 text-black" : "bg-white/5 text-white/55")}>{category}</button>)}</div>
          <div aria-busy={sampleLibraryLoading} className="space-y-1">{sampleLibraryLoading && <p className="p-3 text-sm text-cyan-200">Loading your sounds…</p>}{!sampleLibraryLoading && visibleSamples.length === 0 && <p className="p-3 text-sm text-white/45">No sounds in this category.</p>}{visibleSamples.slice(0, 80).map((name) => <div key={name} className="group flex items-center gap-1 rounded bg-white/[.035] p-1"><button onClick={() => void previewSample(name)} className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs text-white/65 group-hover:text-white">▶ {name.replace(/\.(wav|mp3|ogg|m4a)$/i, "")}</button><button onClick={() => void loadSample(name)} className="rounded bg-cyan-300/15 px-2 py-2 text-xs font-black text-cyan-200">LOAD</button></div>)}</div>
        </aside>

        <section className="min-h-0 overflow-auto p-4 lg:p-5">
          {workView === "pads" && <div className="grid min-h-full gap-5 xl:grid-cols-[minmax(440px,620px)_minmax(300px,1fr)]">
            <div>
              <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black tracking-[.18em] text-cyan-200">PLAY</p><h2 className="text-2xl font-black">16 PADS</h2></div><span className="text-xs text-white/35">Keyboard: 1–4 · Q–R · A–F · Z–V</span></div>
              <div className="grid grid-cols-4 gap-3 rounded-xl border border-white/10 bg-[#12161b] p-4 shadow-2xl">{pads.map((pad) => <button key={pad.id} aria-label={`Play ${pad.label} pad`} onClick={() => { setSelected(pad.id); void trigger(pad); }} className="relative aspect-square min-h-20 rounded-lg border bg-gradient-to-br from-[#323941] to-[#161a1f] p-3 text-left transition active:scale-95" style={{ borderColor: selected === pad.id ? pad.color : "rgba(255,255,255,.14)", boxShadow: selected === pad.id ? `0 0 24px ${pad.color}55, inset 0 1px rgba(255,255,255,.12)` : "inset 0 1px rgba(255,255,255,.08)" }}><span className="absolute right-2 top-2 text-xs text-white/30">{pad.key}</span><span className="absolute bottom-3 left-3 text-sm font-black" style={{ color: selected === pad.id ? pad.color : "white" }}>{pad.label}</span><span className="absolute left-3 top-3 h-2 w-2 rounded-full bg-green-300" /></button>)}</div>
            </div>
            <div>
              <div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-black tracking-[.18em] text-purple-200">SHAPE</p><h2 className="text-2xl font-black">CHANNEL RACK</h2></div><button onClick={() => { setWorkView("sequence"); setSequencerExpanded(true); }} className="text-xs font-black text-cyan-200">EXPAND SEQUENCER →</button></div>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#12161b]">{pads.slice(0, 8).map((pad) => <div key={pad.id} className={cn("grid grid-cols-[110px_48px_48px_1fr] items-center gap-2 border-b border-white/5 p-2 last:border-0", selected === pad.id && "bg-white/[.045]")}><button onClick={() => setSelected(pad.id)} className="truncate text-left text-sm font-black" style={{ color: pad.color }}>{pad.label}</button><button onClick={() => updatePad(pad.id, { muted: !pad.muted })} className={cn("h-7 rounded bg-white/5 text-xs font-black", pad.muted && "bg-red-400 text-black")}>M</button><button onClick={() => updatePad(pad.id, { solo: !pad.solo })} className={cn("h-7 rounded bg-white/5 text-xs font-black", pad.solo && "bg-yellow-300 text-black")}>S</button><div className="grid grid-cols-8 gap-1">{pad.steps.slice(0, 8).map((on, index) => <button key={index} aria-label={`${pad.label} step ${index + 1}`} onClick={() => toggleStep(pad.id, index)} className="h-7 rounded-sm border" style={{ background: on ? pad.color : "rgba(255,255,255,.035)", borderColor: on ? pad.color : "rgba(255,255,255,.08)" }} />)}</div></div>)}</div>
            </div>
          </div>}

          {workView === "sequence" && <div><div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="mr-3 text-2xl font-black">STEP SEQUENCER</h2><button onClick={undoPattern} className="rounded bg-white/5 px-3 py-2 text-xs font-black">UNDO</button><button onClick={redoPattern} className="rounded bg-white/5 px-3 py-2 text-xs font-black">REDO</button><button onClick={randomize} className="rounded bg-purple-300 px-3 py-2 text-xs font-black text-black">GENERATE</button><button onClick={clearPattern} className="rounded bg-red-400/15 px-3 py-2 text-xs font-black text-red-200">CLEAR</button><button onClick={() => setSequencerExpanded(!sequencerExpanded)} className="ml-auto rounded bg-white/5 px-3 py-2 text-xs font-black">{sequencerExpanded ? "COLLAPSE" : "EXPAND"}</button></div><div className="min-w-[760px] space-y-1 rounded-xl border border-white/10 bg-[#12161b] p-4">{pads.slice(0, sequencerExpanded ? 16 : 8).map((pad) => <div key={pad.id} className="grid items-center gap-1" style={{ gridTemplateColumns: `110px repeat(${patternLength},minmax(24px,1fr))` }}><button onClick={() => setSelected(pad.id)} className="truncate pr-3 text-left text-xs font-black" style={{ color: selected === pad.id ? pad.color : "rgba(255,255,255,.58)" }}>{pad.label}</button>{pad.steps.slice(0, patternLength).map((on, index) => <button key={index} aria-label={`${pad.label} step ${index + 1}`} onClick={() => { setSelectedStep(index); toggleStep(pad.id, index); }} className={cn("h-9 rounded-sm border", step === index && "ring-1 ring-white")} style={{ background: on ? pad.color : "rgba(255,255,255,.03)", borderColor: on ? pad.color : index % 4 === 0 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.07)" }} />)}</div>)}</div></div>}

          {workView === "piano" && <div><div className="mb-4"><p className="text-xs font-black tracking-[.18em] text-yellow-200">MELODY</p><h2 className="text-2xl font-black">808 / PIANO ROLL</h2></div><div className="overflow-auto rounded-xl border border-white/10 bg-[#12161b] p-3"><div className="min-w-[800px]">{[12, 10, 8, 7, 5, 3, 0, -2, -4, -5, -7, -9].map((pitch, row) => <div key={pitch} className="grid grid-cols-[64px_repeat(16,1fr)]"><span className={cn("flex h-10 items-center border-b border-r border-white/10 px-2 text-xs font-black", [1,3,6,8,10].includes(row) ? "bg-black text-white/60" : "bg-white text-black")}>{pitch > 0 ? `+${pitch}` : pitch}</span>{Array.from({ length: 16 }, (_, index) => { const active = activePad.steps[index] && (activePad.stepPitch?.[index] ?? 0) === pitch; return <button key={index} aria-label={`Pitch ${pitch}, step ${index + 1}`} onClick={() => { const nextSteps = [...activePad.steps]; nextSteps[index] = true; const pitches = Array.from({ length: 16 }, (_, i) => activePad.stepPitch?.[i] ?? 0); pitches[index] = pitch; updatePad(activePad.id, { steps: nextSteps, stepPitch: pitches }); }} className="h-10 border-b border-r border-white/[.06]" style={{ background: active ? activePad.color : index % 4 === 0 ? "rgba(255,255,255,.055)" : "transparent" }} />; })}</div>)}</div></div></div>}

          {workView === "sample" && <div className="grid gap-5 xl:grid-cols-[1fr_320px]"><div><div className="mb-4"><p className="text-xs font-black tracking-[.18em] text-cyan-200">SAMPLE</p><h2 className="text-2xl font-black">WAVEFORM EDITOR</h2></div><div className="flex h-56 items-center gap-1 rounded-xl border border-white/10 bg-[#12161b] p-5">{sampleWaveform.length ? sampleWaveform.map((peak, index) => <span key={index} className="flex-1 rounded bg-cyan-300" style={{ height: `${Math.max(8, peak * 100)}%` }} />) : <p className="m-auto text-center text-sm text-white/40">Choose a sound or drag audio here to edit its waveform.</p>}</div>{sampleSlices.length > 0 && <div className="mt-3 grid grid-cols-8 gap-2">{sampleSlices.map((slice) => <button key={slice.index} onClick={() => updatePad(activePad.id, { sliceStart: slice.start, sliceDuration: slice.duration })} className="rounded border border-purple-300/30 py-3 text-xs font-black text-purple-200">SLICE {slice.index + 1}</button>)}</div>}</div><div className="rounded-xl border border-white/10 bg-[#12161b] p-4"><h3 className="mb-4 text-lg font-black" style={{ color: activePad.color }}>{activePad.label}</h3><label className="mb-4 block text-sm text-white/55">Tune: {activePad.tune ?? 0} semitones<input className="mt-2 w-full accent-cyan-300" type="range" min="-24" max="24" value={activePad.tune ?? 0} onChange={(event) => updatePad(activePad.id, { tune: Number(event.target.value) })} /></label><label className="mb-4 block text-sm text-white/55">Playback<select value={activePad.mode ?? "one-shot"} onChange={(event) => updatePad(activePad.id, { mode: event.target.value as "one-shot" | "loop" })} className="mt-2 h-10 w-full rounded bg-black px-3"><option value="one-shot">One-shot</option><option value="loop">Loop</option></select></label><button onClick={() => updatePad(activePad.id, { stepReverse: Array(16).fill(true) })} className="mb-2 h-10 w-full rounded bg-white/5 text-sm font-black">REVERSE</button><button onClick={() => void trigger(activePad)} className="h-10 w-full rounded bg-cyan-300 text-sm font-black text-black">AUDITION</button></div></div>}

          {workView === "mixer" && <div><div className="mb-4"><p className="text-xs font-black tracking-[.18em] text-green-200">LEVELS</p><h2 className="text-2xl font-black">PAD MIXER</h2></div><div className="grid min-w-[900px] grid-cols-8 gap-2">{pads.map((pad) => <div key={pad.id} className="rounded-lg border border-white/10 bg-[#12161b] p-3 text-center"><strong className="block truncate text-xs" style={{ color: pad.color }}>{pad.label}</strong><input aria-label={`${pad.label} volume`} type="range" min="0" max="100" value={pad.volume} onChange={(event) => updatePad(pad.id, { volume: Number(event.target.value) })} className="my-6 h-32 w-5 accent-cyan-300 [writing-mode:vertical-lr] [direction:rtl]" /><span className="block text-xs text-white/40">{pad.volume}</span><input aria-label={`${pad.label} pan`} type="range" min="-50" max="50" value={pad.pan} onChange={(event) => updatePad(pad.id, { pan: Number(event.target.value) })} className="mt-3 w-full accent-purple-300" /><div className="mt-3 grid grid-cols-2 gap-1"><button onClick={() => updatePad(pad.id, { muted: !pad.muted })} className={cn("rounded bg-white/5 py-2 text-xs font-black", pad.muted && "bg-red-400 text-black")}>M</button><button onClick={() => updatePad(pad.id, { solo: !pad.solo })} className={cn("rounded bg-white/5 py-2 text-xs font-black", pad.solo && "bg-yellow-300 text-black")}>S</button></div></div>)}</div></div>}

          <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs text-white/40"><span>{lastAction}</span><span>·</span><span>{pads.filter((pad) => pad.sampleAsset).length} custom samples</span><span>·</span><span>{studioMode ? "Studio synced" : "Standalone"}</span>{sampleError && <span className="text-red-300">{sampleError}</span>}<div className="ml-auto flex gap-2"><input value={patternName} onChange={(event) => setPatternName(event.target.value)} aria-label="Pattern name" className="h-8 rounded bg-black px-3 text-white" /><button onClick={savePattern} className="rounded bg-white/5 px-3 font-black text-white">SAVE</button><button onClick={() => void exportAudio("mp3")} className="rounded bg-white/5 px-3 font-black text-white">EXPORT MP3</button>{onOpenEdit && <button onClick={onOpenEdit} className="rounded bg-cyan-300 px-3 font-black text-black">ARRANGE SONG →</button>}</div></footer>
        </section>
      </main>
    </div>
  </div>;
}
