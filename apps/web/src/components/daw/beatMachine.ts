/**
 * EMS beat machine audio core.
 * Pitch-aware for every lane so drums, percussion, 808s, hats, claps,
 * crashes and samples can all be played from piano-roll notes.
 */

export type DrumKind = "kick" | "snare" | "clap" | "hat" | "openHat" | "perc" | "bass808" | "crash";
export const DRUM_LANES: DrumKind[] = ["kick", "snare", "clap", "hat", "openHat", "perc", "bass808", "crash"];
export const STEPS = 16;
export const STEPS_PER_BEAT = 4;
export type BeatPattern = Record<DrumKind, boolean[]>;
export type DrumKitId = "trap" | "drill" | "afro" | "hyperpop" | "boomBap" | "lofi" | "acoustic";

export interface BeatStepOptions {
  velocity?: number;
  probability?: number;
  microShiftMs?: number;
  repeats?: number;
}

export type BeatLaneLayerKit = Partial<Record<DrumKind, DrumKitId>>;
export type BeatStepOptionsMap = Partial<Record<DrumKind, Record<number, BeatStepOptions>>>;

export interface BeatLaneEqSetting {
  hpHz: number | null;
  lpHz: number | null;
}

interface VoiceOptions {
  when: number;
  velocity?: number;
  kit?: DrumKitId;
  /** Semitone offset from the lane's natural sound. Used by every synth/sample lane. */
  pitchSemis?: number;
  sampleBuffer?: AudioBuffer | null;
  laneEq?: BeatLaneEqSetting;
}

interface LaneSampleTone { hpHz?: number; lpHz?: number; gain: number }
const LANE_SAMPLE_TONE: Record<DrumKind, LaneSampleTone> = {
  kick: { hpHz: 20, lpHz: 9000, gain: 1 },
  snare: { hpHz: 120, lpHz: 12000, gain: 0.95 },
  clap: { hpHz: 500, lpHz: 14000, gain: 0.92 },
  hat: { hpHz: 4000, lpHz: 16000, gain: 0.88 },
  openHat: { hpHz: 3200, lpHz: 16000, gain: 0.9 },
  perc: { hpHz: 250, lpHz: 12500, gain: 0.92 },
  bass808: { hpHz: 20, lpHz: 260, gain: 1.05 },
  crash: { hpHz: 1800, lpHz: 16000, gain: 0.85 },
};

interface KitParams {
  kickStartHz: number; kickEndHz: number; kickDecaySec: number; kickClickHz: number; kickClickGain: number;
  snareBandHz: number; snareBodyHz: number; snareDecaySec: number;
  clapHpHz: number;
  hatHpHz: number; hatDecaySec: number;
  openHatHpHz: number; openHatDecaySec: number;
  percHz: number; percDecaySec: number;
  bass808Hz: number; bass808DecaySec: number; bass808SlideSemis: number; bass808SlideTime: number;
  crashHpHz: number; crashDecaySec: number;
  drive: number;
}

const KITS: Record<DrumKitId, KitParams> = {
  trap: { kickStartHz: 95, kickEndHz: 30, kickDecaySec: 0.45, kickClickHz: 4500, kickClickGain: 0.18, snareBandHz: 1700, snareBodyHz: 200, snareDecaySec: 0.16, clapHpHz: 1400, hatHpHz: 9000, hatDecaySec: 0.038, openHatHpHz: 7500, openHatDecaySec: 0.32, percHz: 1100, percDecaySec: 0.08, bass808Hz: 55, bass808DecaySec: 0.95, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 5500, crashDecaySec: 1.4, drive: 0.12 },
  drill: { kickStartHz: 75, kickEndHz: 28, kickDecaySec: 0.55, kickClickHz: 3500, kickClickGain: 0.22, snareBandHz: 2100, snareBodyHz: 180, snareDecaySec: 0.09, clapHpHz: 1700, hatHpHz: 9500, hatDecaySec: 0.025, openHatHpHz: 8000, openHatDecaySec: 0.28, percHz: 1400, percDecaySec: 0.06, bass808Hz: 48, bass808DecaySec: 0.7, bass808SlideSemis: -3, bass808SlideTime: 0.18, crashHpHz: 6500, crashDecaySec: 1.0, drive: 0.18 },
  afro: { kickStartHz: 120, kickEndHz: 50, kickDecaySec: 0.32, kickClickHz: 2800, kickClickGain: 0.1, snareBandHz: 1500, snareBodyHz: 220, snareDecaySec: 0.18, clapHpHz: 1100, hatHpHz: 7500, hatDecaySec: 0.06, openHatHpHz: 6500, openHatDecaySec: 0.4, percHz: 900, percDecaySec: 0.12, bass808Hz: 58, bass808DecaySec: 0.6, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 5000, crashDecaySec: 1.6, drive: 0.05 },
  hyperpop: { kickStartHz: 130, kickEndHz: 45, kickDecaySec: 0.22, kickClickHz: 5500, kickClickGain: 0.28, snareBandHz: 2400, snareBodyHz: 280, snareDecaySec: 0.12, clapHpHz: 2000, hatHpHz: 11000, hatDecaySec: 0.04, openHatHpHz: 9500, openHatDecaySec: 0.25, percHz: 1800, percDecaySec: 0.05, bass808Hz: 70, bass808DecaySec: 0.5, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 7000, crashDecaySec: 0.85, drive: 0.35 },
  boomBap: { kickStartHz: 100, kickEndHz: 55, kickDecaySec: 0.28, kickClickHz: 3200, kickClickGain: 0.2, snareBandHz: 1400, snareBodyHz: 240, snareDecaySec: 0.22, clapHpHz: 900, hatHpHz: 6500, hatDecaySec: 0.06, openHatHpHz: 5500, openHatDecaySec: 0.45, percHz: 850, percDecaySec: 0.1, bass808Hz: 60, bass808DecaySec: 0.5, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 4500, crashDecaySec: 1.8, drive: 0.15 },
  lofi: { kickStartHz: 95, kickEndHz: 40, kickDecaySec: 0.28, kickClickHz: 2800, kickClickGain: 0.12, snareBandHz: 900, snareBodyHz: 180, snareDecaySec: 0.18, clapHpHz: 800, hatHpHz: 5500, hatDecaySec: 0.05, openHatHpHz: 4500, openHatDecaySec: 0.35, percHz: 700, percDecaySec: 0.1, bass808Hz: 55, bass808DecaySec: 0.8, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 4000, crashDecaySec: 1.4, drive: 0.4 },
  acoustic: { kickStartHz: 110, kickEndHz: 35, kickDecaySec: 0.35, kickClickHz: 3000, kickClickGain: 0.15, snareBandHz: 1500, snareBodyHz: 200, snareDecaySec: 0.18, clapHpHz: 1200, hatHpHz: 7000, hatDecaySec: 0.05, openHatHpHz: 6000, openHatDecaySec: 0.4, percHz: 1000, percDecaySec: 0.1, bass808Hz: 60, bass808DecaySec: 0.6, bass808SlideSemis: 0, bass808SlideTime: 0, crashHpHz: 5000, crashDecaySec: 1.5, drive: 0 },
};

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

export function emptyPattern(): BeatPattern {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = Array(STEPS).fill(false);
    return acc;
  }, {} as BeatPattern);
}

export type BeatFillPreset = "simple" | "medium" | "wild";
export function fillPattern(preset: BeatFillPreset): BeatPattern {
  const p = emptyPattern();
  const add = (lane: DrumKind, steps: number[]) => steps.forEach((i) => (p[lane][i] = true));
  if (preset === "simple") { add("snare", [12, 13, 14, 15]); add("hat", [0, 2, 4, 6, 8, 10, 12, 14]); }
  else if (preset === "medium") { add("snare", [8, 10, 12, 13, 14, 15]); add("hat", [0, 2, 4, 6, 8, 10]); add("clap", [12, 14, 15]); add("crash", [15]); }
  else { add("snare", [8, 9, 10, 11, 12, 13, 14, 15]); add("clap", [10, 12, 14, 15]); add("kick", [0, 4]); add("crash", [15]); }
  return p;
}

export function demoPattern(): BeatPattern {
  const p = emptyPattern();
  [0, 4, 8, 12].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [2, 6, 10, 14].forEach((i) => (p.hat[i] = true));
  return p;
}

export function trapDemoPattern(): BeatPattern {
  const p = emptyPattern();
  [0, 6, 10].forEach((i) => { p.kick[i] = true; p.bass808[i] = true; });
  [4, 12].forEach((i) => { p.snare[i] = true; p.clap[i] = true; });
  [0, 2, 4, 6, 8, 10, 11, 12, 14].forEach((i) => (p.hat[i] = true));
  p.openHat[7] = true;
  return p;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function suggestPattern(kit: DrumKitId, bpm: number, seed?: number): BeatPattern {
  const p = kit === "trap" || kit === "drill" ? trapDemoPattern() : demoPattern();
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31));
  const density = bpm >= 150 ? 0.65 : bpm >= 110 ? 0.85 : 1;
  DRUM_LANES.forEach((lane) => {
    p[lane] = p[lane].map((enabled, index) => enabled || (lane === "hat" && index % 2 === 1 && rng() < 0.22 * density));
  });
  if (kit === "afro") [3, 7, 11, 15].forEach((i) => (p.perc[i] = true));
  if (kit === "hyperpop") p.hat = p.hat.map(() => true);
  return p;
}

function pitchRatio(pitchSemis = 0) { return Math.pow(2, pitchSemis / 12); }
function safeHz(value: number) { return Math.max(18, Math.min(18000, value)); }
function safeGain(value: number) { return Math.max(0, Math.min(1.25, value)); }

function createNoiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 1);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function createSaturator(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const samples = 2048;
  const curve = new Float32Array(samples);
  const k = 1 + drive * 12;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

function connectEq(ctx: BaseAudioContext, input: AudioNode, dest: AudioNode, when: number, laneEq?: BeatLaneEqSetting) {
  let node = input;
  if (laneEq?.hpHz && laneEq.hpHz > 0) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(laneEq.hpHz, when); node.connect(hp); node = hp; }
  if (laneEq?.lpHz && laneEq.lpHz > 0) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(laneEq.lpHz, when); node.connect(lp); node = lp; }
  node.connect(dest);
}

export function scheduleDrumHit(ctx: BaseAudioContext, dest: AudioNode, kind: DrumKind, opts: VoiceOptions) {
  const { when, velocity = 1, kit = "acoustic", pitchSemis = 0, sampleBuffer = null, laneEq } = opts;
  const params = KITS[kit] ?? KITS.acoustic;
  const ratio = pitchRatio(pitchSemis);
  const out = params.drive > 0 ? createSaturator(ctx, params.drive) : null;
  if (out) out.connect(dest);
  const target = out ?? dest;
  const v = safeGain(velocity);

  if (sampleBuffer) {
    const source = ctx.createBufferSource();
    const amp = ctx.createGain();
    const tone = LANE_SAMPLE_TONE[kind];
    source.buffer = sampleBuffer;
    source.playbackRate.setValueAtTime(ratio, when);
    amp.gain.setValueAtTime(safeGain(v * tone.gain), when);
    let chain: AudioNode = source;
    if (tone.hpHz) { const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(tone.hpHz, when); chain.connect(hp); chain = hp; }
    if (tone.lpHz) { const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(tone.lpHz, when); chain.connect(lp); chain = lp; }
    connectEq(ctx, chain, amp, when, laneEq);
    amp.connect(target);
    source.start(when);
    return;
  }

  switch (kind) {
    case "kick": {
      const body = ctx.createOscillator(); const amp = ctx.createGain();
      body.type = "sine";
      body.frequency.setValueAtTime(safeHz(params.kickStartHz * ratio), when);
      body.frequency.exponentialRampToValueAtTime(safeHz(params.kickEndHz * ratio), when + 0.12);
      connectEq(ctx, body, amp, when, laneEq); amp.connect(target);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.95 * v, when + 0.004);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + params.kickDecaySec);
      body.start(when); body.stop(when + params.kickDecaySec + 0.04);
      const click = createNoiseSource(ctx); const hp = ctx.createBiquadFilter(); const ca = ctx.createGain();
      hp.type = "highpass"; hp.frequency.setValueAtTime(safeHz(params.kickClickHz * Math.min(2, ratio)), when);
      click.connect(hp).connect(ca).connect(target);
      ca.gain.setValueAtTime(0.0001, when); ca.gain.exponentialRampToValueAtTime(params.kickClickGain * v, when + 0.001); ca.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
      click.start(when); click.stop(when + 0.018);
      break;
    }
    case "snare": {
      const noise = createNoiseSource(ctx); const bp = ctx.createBiquadFilter(); const amp = ctx.createGain();
      bp.type = "bandpass"; bp.frequency.setValueAtTime(safeHz(params.snareBandHz * ratio), when); bp.Q.value = 1.25;
      noise.connect(bp).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when); amp.gain.exponentialRampToValueAtTime(0.6 * v, when + 0.004); amp.gain.exponentialRampToValueAtTime(0.0001, when + params.snareDecaySec);
      noise.start(when); noise.stop(when + params.snareDecaySec + 0.02);
      const body = ctx.createOscillator(); const ba = ctx.createGain(); body.type = "triangle"; body.frequency.setValueAtTime(safeHz(params.snareBodyHz * ratio), when);
      connectEq(ctx, body, ba, when, laneEq); ba.connect(target); ba.gain.setValueAtTime(0.0001, when); ba.gain.exponentialRampToValueAtTime(0.22 * v, when + 0.006); ba.gain.exponentialRampToValueAtTime(0.0001, when + params.snareDecaySec * 0.7);
      body.start(when); body.stop(when + params.snareDecaySec);
      break;
    }
    case "clap": {
      [0, 0.011, 0.024, 0.05].forEach((off) => { const n = createNoiseSource(ctx); const hp = ctx.createBiquadFilter(); const amp = ctx.createGain(); const t = when + off; hp.type = "highpass"; hp.frequency.setValueAtTime(safeHz(params.clapHpHz * ratio), t); n.connect(hp).connect(amp).connect(target); amp.gain.setValueAtTime(0.0001, t); amp.gain.exponentialRampToValueAtTime((off === 0.05 ? 0.42 : 0.58) * v, t + 0.002); amp.gain.exponentialRampToValueAtTime(0.0001, t + (off === 0.05 ? 0.13 : 0.04)); n.start(t); n.stop(t + (off === 0.05 ? 0.14 : 0.05)); });
      break;
    }
    case "hat":
    case "openHat":
    case "crash": {
      const n = createNoiseSource(ctx); const hp = ctx.createBiquadFilter(); const amp = ctx.createGain();
      const isOpen = kind === "openHat"; const isCrash = kind === "crash";
      const hpBase = isCrash ? params.crashHpHz : isOpen ? params.openHatHpHz : params.hatHpHz;
      const decay = isCrash ? params.crashDecaySec : isOpen ? params.openHatDecaySec : params.hatDecaySec;
      const gain = isCrash ? 0.32 : isOpen ? 0.4 : 0.32;
      hp.type = "highpass"; hp.frequency.setValueAtTime(safeHz(hpBase * ratio), when);
      n.connect(hp).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when); amp.gain.exponentialRampToValueAtTime(gain * v, when + 0.002); amp.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      n.start(when); n.stop(when + decay + 0.05);
      break;
    }
    case "perc": {
      const osc = ctx.createOscillator(); const bp = ctx.createBiquadFilter(); const amp = ctx.createGain();
      osc.type = "triangle"; osc.frequency.setValueAtTime(safeHz(params.percHz * ratio), when);
      bp.type = "bandpass"; bp.frequency.setValueAtTime(safeHz(params.percHz * ratio), when); bp.Q.value = 2;
      osc.connect(bp).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when); amp.gain.exponentialRampToValueAtTime(0.42 * v, when + 0.002); amp.gain.exponentialRampToValueAtTime(0.0001, when + params.percDecaySec);
      osc.start(when); osc.stop(when + params.percDecaySec + 0.02);
      break;
    }
    case "bass808": {
      const baseHz = safeHz(params.bass808Hz * ratio);
      const startHz = params.bass808SlideSemis !== 0 ? safeHz(baseHz * pitchRatio(params.bass808SlideSemis)) : baseHz;
      const osc = ctx.createOscillator(); const amp = ctx.createGain(); osc.type = "sine";
      osc.frequency.setValueAtTime(startHz, when);
      if (params.bass808SlideTime > 0 && startHz !== baseHz) osc.frequency.exponentialRampToValueAtTime(baseHz, when + params.bass808SlideTime);
      connectEq(ctx, osc, amp, when, laneEq); amp.connect(target);
      amp.gain.setValueAtTime(0.0001, when); amp.gain.exponentialRampToValueAtTime(0.85 * v, when + 0.008); amp.gain.exponentialRampToValueAtTime(0.0001, when + params.bass808DecaySec);
      osc.start(when); osc.stop(when + params.bass808DecaySec + 0.05);
      break;
    }
  }
}

export async function renderPatternToBuffer(pattern: BeatPattern, bpm: number, bars = 1, sampleRate = 44100, kit: DrumKitId = "acoustic"): Promise<AudioBuffer> {
  const stepSec = 60 / bpm / STEPS_PER_BEAT;
  const offline = new OfflineAudioContext(2, Math.ceil((STEPS * bars * stepSec + 2) * sampleRate), sampleRate);
  for (let bar = 0; bar < bars; bar += 1) for (let step = 0; step < STEPS; step += 1) for (const lane of DRUM_LANES) if (pattern[lane][step]) scheduleDrumHit(offline, offline.destination, lane, { when: (bar * STEPS + step) * stepSec, kit });
  return offline.startRendering();
}

export async function renderLaneToBuffer(pattern: BeatPattern, lane: DrumKind, bpm: number, bars = 1, sampleRate = 44100, kit: DrumKitId = "acoustic"): Promise<AudioBuffer> {
  const stepSec = 60 / bpm / STEPS_PER_BEAT;
  const offline = new OfflineAudioContext(2, Math.ceil((STEPS * bars * stepSec + 2) * sampleRate), sampleRate);
  for (let bar = 0; bar < bars; bar += 1) for (let step = 0; step < STEPS; step += 1) if (pattern[lane][step]) scheduleDrumHit(offline, offline.destination, lane, { when: (bar * STEPS + step) * stepSec, kit });
  return offline.startRendering();
}
