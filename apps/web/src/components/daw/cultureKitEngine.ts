import type { DrumKind } from "./beatMachine";

export type CultureKitSample = {
  name: string;
  fileName?: string;
  url: string;
  category: string;
  gain?: number;
  engine?: {
    signaturePreset?: string;
    quality?: string;
    normalization?: string;
    softClip?: boolean;
    transientPunch?: boolean;
    subEnhance?: boolean;
    stereoWidth?: number;
  };
};

export type CultureKitManifest = Record<string, Array<CultureKitSample | string> | CultureKitSample | string>;

export type CultureKitPack = {
  id: string;
  name: string;
  genre: string | null;
  bpm: number | null;
  samples: CultureKitManifest;
};

export type CultureLane = DrumKind | "melody" | "vocal" | "fx" | "texture";

export type CultureLaneAssignment = {
  lane: CultureLane;
  category: string;
  label: string;
  url: string;
  gain: number;
  waveform: number[];
  preset: "drum_punch" | "sub_808" | "melody_wide" | "vocal_hype" | "fx_wide";
};

const BUFFER_CACHE = new Map<string, Promise<AudioBuffer>>();

export const EMS_CULTURE_KIT_ID = "ems-culture-monster-2026";

export const EMS_PRODUCER_CHAIN = {
  id: "ems_culture_monster_2026",
  name: "EMS Culture Monster 2026",
  description: "808-heavy trap/R&B/hip-hop front-end chain with punch, width, soft clipping, and limiter-safe loudness.",
  lanes: {
    kick: { gain: 1.12, hpfHz: 28, punch: 0.85, softClip: 0.72 },
    snare: { gain: 1.05, bodyHz: 220, snapHz: 5200, punch: 0.7 },
    clap: { gain: 1.05, width: 0.18, snapHz: 6200 },
    hat: { gain: 0.88, hpfHz: 420, deharshHz: 9400 },
    openHat: { gain: 0.9, hpfHz: 360, deharshHz: 8600 },
    perc: { gain: 0.95, punch: 0.45, width: 0.12 },
    bass808: { gain: 1.18, monoBelowHz: 140, subEnhance: 0.9, softClip: 0.82 },
    crash: { gain: 0.85, hpfHz: 180, width: 0.35 },
    melody: { gain: 0.82, hpfHz: 120, width: 0.35, vocalPocketDb: -1.5 },
    vocal: { gain: 0.95, hpfHz: 100, presenceHz: 3500, width: 0.28 },
    fx: { gain: 0.9, hpfHz: 150, width: 0.4 },
  },
};

export const EMS_MASTER_BUS_PRESETS = {
  cultureMonster: {
    label: "Culture Monster Loud",
    target: "producer demo loud, no ugly clipping",
    inputTrimDb: -3,
    glueCompression: { thresholdDb: -18, ratio: 2.2, attackMs: 12, releaseMs: 90 },
    softClip: { drive: 0.72, ceilingDb: -1.0 },
    limiter: { thresholdDb: -1.0, releaseMs: 60 },
    stereo: { width: 0.18, monoBelowHz: 120 },
  },
  rnbWide: {
    label: "R&B Wide Glue",
    inputTrimDb: -4,
    glueCompression: { thresholdDb: -20, ratio: 1.8, attackMs: 18, releaseMs: 140 },
    softClip: { drive: 0.42, ceilingDb: -1.2 },
    limiter: { thresholdDb: -1.2, releaseMs: 90 },
    stereo: { width: 0.28, monoBelowHz: 100 },
  },
};

function getAudioContext() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not supported in this browser.");
  return new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
}

function toSample(value: CultureKitSample | string, category: string): CultureKitSample | null {
  if (typeof value === "string") return { name: category, url: value, category };
  if (!value?.url) return null;
  return { ...value, category: value.category ?? category };
}

export function flattenCultureKitSamples(samples: CultureKitManifest): CultureKitSample[] {
  const out: CultureKitSample[] = [];
  for (const [category, raw] of Object.entries(samples ?? {})) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      const sample = toSample(value, category);
      if (sample) out.push(sample);
    }
  }
  return out;
}

export function categoryToLane(category: string): CultureLane {
  const c = category.toLowerCase();
  if (c === "kick") return "kick";
  if (c === "snare") return "snare";
  if (c === "clap") return "clap";
  if (c === "hat" || c === "closed_hat") return "hat";
  if (c === "open_hat" || c === "openhat") return "openHat";
  if (c === "perc" || c === "percussion") return "perc";
  if (c === "808" || c === "bass" || c === "sub") return "bass808";
  if (c === "melody" || c === "loop") return "melody";
  if (c === "vocal" || c === "vox") return "vocal";
  if (c === "fx" || c === "texture") return "fx";
  return "texture";
}

export function lanePreset(lane: CultureLane): CultureLaneAssignment["preset"] {
  if (lane === "bass808") return "sub_808";
  if (lane === "melody" || lane === "texture") return "melody_wide";
  if (lane === "vocal") return "vocal_hype";
  if (lane === "fx" || lane === "crash") return "fx_wide";
  return "drum_punch";
}

export async function loadCultureKitBuffer(url: string, ctx?: AudioContext): Promise<AudioBuffer> {
  const cached = BUFFER_CACHE.get(url);
  if (cached) return cached;

  const promise = (async () => {
    const localCtx = ctx ?? getAudioContext();
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Could not load sample: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await localCtx.decodeAudioData(arrayBuffer.slice(0));
    if (!ctx) await localCtx.close().catch(() => undefined);
    return decoded;
  })();

  BUFFER_CACHE.set(url, promise);
  return promise;
}

export async function preloadCultureKit(samples: CultureKitManifest, limit = 32): Promise<number> {
  const ctx = getAudioContext();
  try {
    const urls = flattenCultureKitSamples(samples).slice(0, limit).map((sample) => sample.url);
    const results = await Promise.allSettled(urls.map((url) => loadCultureKitBuffer(url, ctx)));
    return results.filter((result) => result.status === "fulfilled").length;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export function makeWaveformPeaks(buffer: AudioBuffer, points = 64): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / points));
  const peaks: number[] = [];
  for (let i = 0; i < points; i += 1) {
    let peak = 0;
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    for (let j = start; j < end; j += 1) peak = Math.max(peak, Math.abs(channel[j] ?? 0));
    peaks.push(Number(peak.toFixed(4)));
  }
  return peaks;
}

export async function buildCultureLaneAssignments(samples: CultureKitManifest): Promise<CultureLaneAssignment[]> {
  const ctx = getAudioContext();
  try {
    const flattened = flattenCultureKitSamples(samples);
    const firstByLane = new Map<CultureLane, CultureKitSample>();
    for (const sample of flattened) {
      const lane = categoryToLane(sample.category);
      if (!firstByLane.has(lane)) firstByLane.set(lane, sample);
    }

    const assignments: CultureLaneAssignment[] = [];
    for (const [lane, sample] of firstByLane.entries()) {
      const buffer = await loadCultureKitBuffer(sample.url, ctx).catch(() => null);
      assignments.push({
        lane,
        category: sample.category,
        label: sample.name || sample.fileName || sample.category,
        url: sample.url,
        gain: sample.gain ?? EMS_PRODUCER_CHAIN.lanes[lane as keyof typeof EMS_PRODUCER_CHAIN.lanes]?.gain ?? 1,
        waveform: buffer ? makeWaveformPeaks(buffer, 48) : [],
        preset: lanePreset(lane),
      });
    }

    return assignments;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function fetchDefaultCultureKit(): Promise<CultureKitPack | null> {
  const response = await fetch(`/api/kit-packs?featured=1`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json() as { packs?: CultureKitPack[] };
  return data.packs?.find((pack) => pack.id === EMS_CULTURE_KIT_ID) ?? data.packs?.[0] ?? null;
}

export function kitToLaneUrlMap(samples: CultureKitManifest): Record<DrumKind, string> {
  const lanes: Partial<Record<DrumKind, string>> = {};
  for (const sample of flattenCultureKitSamples(samples)) {
    const lane = categoryToLane(sample.category);
    if (["kick", "snare", "clap", "hat", "openHat", "perc", "bass808", "crash"].includes(lane) && !lanes[lane as DrumKind]) {
      lanes[lane as DrumKind] = sample.url;
    }
  }
  return lanes as Record<DrumKind, string>;
}
