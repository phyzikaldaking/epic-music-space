/**
 * Beat machine for the EMS DAW — modernized for 2026 production sounds.
 *
 * Sounds are synthesized via Web Audio (no sample bundle, no licensing
 * mess, every drum is generated on the fly). This file is the single
 * source of truth for both live playback and offline render-to-track,
 * because both paths feed the same `scheduleDrumHit()` against either
 * an `AudioContext` or `OfflineAudioContext`.
 *
 * Lanes (8):
 *   • kick      — body + click; tuned per kit
 *   • snare     — band-passed noise + low-mid body
 *   • clap      — multi-tap noise burst (the natural "splat")
 *   • hat       — closed hi-hat (high-passed noise, fast decay)
 *   • openHat   — open hat (longer ringing decay, brighter)
 *   • perc      — pitched wood-block / shaker style transient
 *   • bass808   — sub-bass tone, optional pitch slides for melodic 808s
 *   • crash     — long shimmery noise wash (used as accents)
 *
 * Kits (7):
 *   • trap          — modern Atlanta-style: long sub-808, snappy snare,
 *                     fast hats, layered clap
 *   • drill         — UK/NY drill: detuned 808 with slides, dry tight
 *                     snare (mostly used on step 7), sparse hats
 *   • afro          — Afrobeats: warm log-drum kick, hand-percussion
 *                     forward, mid-bright hats
 *   • hyperpop      — pitched-up percussion, distorted snare, bright
 *                     glitched hats
 *   • boomBap       — 90s East Coast: punchy mid-range kick, dusty
 *                     snare with low-mid body, vinyl-tone hats
 *   • lofi          — washed, warm, drive saturation on everything
 *   • acoustic      — clean, untreated reference kit
 */

export type DrumKind =
  | "kick"
  | "snare"
  | "clap"
  | "hat"
  | "openHat"
  | "perc"
  | "bass808"
  | "crash";

export const DRUM_LANES: DrumKind[] = [
  "kick",
  "snare",
  "clap",
  "hat",
  "openHat",
  "perc",
  "bass808",
  "crash",
];

export const STEPS = 16;
/** Beat machine ALWAYS runs at 4 sixteenths per beat → 4 beats per pattern. */
export const STEPS_PER_BEAT = 4;

export type BeatPattern = Record<DrumKind, boolean[]>;

/** Sensible empty pattern — all 16 steps off across all lanes. */
export function emptyPattern(): BeatPattern {
  return DRUM_LANES.reduce((acc, lane) => {
    acc[lane] = Array(STEPS).fill(false);
    return acc;
  }, {} as BeatPattern);
}

/** Classic four-on-the-floor demo pattern so a new user has *something*
 *  ringing the moment they hit play. */
export function demoPattern(): BeatPattern {
  const p = emptyPattern();
  // Kick on every quarter (steps 0, 4, 8, 12)
  [0, 4, 8, 12].forEach((i) => (p.kick[i] = true));
  // Snare on the back beats (steps 4, 12)
  [4, 12].forEach((i) => (p.snare[i] = true));
  // Hat on every off-beat eighth (steps 2, 6, 10, 14)
  [2, 6, 10, 14].forEach((i) => (p.hat[i] = true));
  return p;
}

/** Modern trap demo for the "808" / "trap" kits — gives new users an
 *  immediate "this sounds like a record" reference. */
export function trapDemoPattern(): BeatPattern {
  const p = emptyPattern();
  [0, 6, 10].forEach((i) => (p.kick[i] = true));
  [4, 12].forEach((i) => (p.snare[i] = true));
  [4, 12].forEach((i) => (p.clap[i] = true));
  // Roll hats on every 8th + a few 16th rolls
  [0, 2, 4, 6, 8, 10, 11, 12, 14].forEach((i) => (p.hat[i] = true));
  [7].forEach((i) => (p.openHat[i] = true));
  [0, 6, 10].forEach((i) => (p.bass808[i] = true));
  return p;
}

export type DrumKitId =
  | "trap"
  | "drill"
  | "afro"
  | "hyperpop"
  | "boomBap"
  | "lofi"
  | "acoustic";

interface VoiceOptions {
  /** When (ctx-time) the hit should sound. */
  when: number;
  /** Amplitude scale 0..1. Defaults to 1. */
  velocity?: number;
  /** Kit preset that tunes the synthesis. Defaults to acoustic. */
  kit?: DrumKitId;
  /** Optional pitch in semitones from middle C for pitched lanes (808). */
  pitchSemis?: number;
}

interface KitParams {
  // Kick
  kickStartHz: number;
  kickEndHz: number;
  kickDecaySec: number;
  kickClickHz: number; // transient click frequency
  kickClickGain: number; // 0..1
  // Snare
  snareBandHz: number;
  snareBandQ: number;
  snareBodyHz: number;
  snareBodyGain: number;
  snareDecaySec: number;
  // Clap
  clapBandHpHz: number; // high-pass on the clap noise
  // Hat
  hatHpHz: number;
  hatDecaySec: number;
  // Open hat
  openHatHpHz: number;
  openHatDecaySec: number;
  // Perc
  percHz: number;
  percDecaySec: number;
  // 808 sub
  bass808Hz: number; // base frequency before pitch
  bass808DecaySec: number;
  bass808SlideSemis: number; // slide from this offset → 0
  bass808SlideTime: number; // seconds
  // Crash
  crashHpHz: number;
  crashDecaySec: number;
  /** Drive (0..1) applied as soft-knee saturation gain. lofi crunches. */
  drive: number;
}

const KITS: Record<DrumKitId, KitParams> = {
  trap: {
    kickStartHz: 95,
    kickEndHz: 30,
    kickDecaySec: 0.45,
    kickClickHz: 4500,
    kickClickGain: 0.18,
    snareBandHz: 1700,
    snareBandQ: 1.2,
    snareBodyHz: 200,
    snareBodyGain: 0.32,
    snareDecaySec: 0.16,
    clapBandHpHz: 1400,
    hatHpHz: 9000,
    hatDecaySec: 0.038,
    openHatHpHz: 7500,
    openHatDecaySec: 0.32,
    percHz: 1100,
    percDecaySec: 0.08,
    bass808Hz: 55,
    bass808DecaySec: 0.95,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 5500,
    crashDecaySec: 1.4,
    drive: 0.12,
  },
  drill: {
    kickStartHz: 75,
    kickEndHz: 28,
    kickDecaySec: 0.55,
    kickClickHz: 3500,
    kickClickGain: 0.22,
    snareBandHz: 2100, // brighter, snappier
    snareBandQ: 1.6,
    snareBodyHz: 180,
    snareBodyGain: 0.18, // drier, less body
    snareDecaySec: 0.09, // very tight
    clapBandHpHz: 1700,
    hatHpHz: 9500,
    hatDecaySec: 0.025, // dryer, sparse
    openHatHpHz: 8000,
    openHatDecaySec: 0.28,
    percHz: 1400,
    percDecaySec: 0.06,
    bass808Hz: 48, // low + dark
    bass808DecaySec: 0.7,
    bass808SlideSemis: -3, // characteristic UK drill bass slide
    bass808SlideTime: 0.18,
    crashHpHz: 6500,
    crashDecaySec: 1.0,
    drive: 0.18,
  },
  afro: {
    kickStartHz: 120, // log-drum-like, more body up high
    kickEndHz: 50,
    kickDecaySec: 0.32,
    kickClickHz: 2800,
    kickClickGain: 0.1,
    snareBandHz: 1500,
    snareBandQ: 0.9,
    snareBodyHz: 220,
    snareBodyGain: 0.42, // warmer
    snareDecaySec: 0.18,
    clapBandHpHz: 1100,
    hatHpHz: 7500,
    hatDecaySec: 0.06,
    openHatHpHz: 6500,
    openHatDecaySec: 0.4,
    percHz: 900, // wood-block / shaker tone
    percDecaySec: 0.12,
    bass808Hz: 58,
    bass808DecaySec: 0.6,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 5000,
    crashDecaySec: 1.6,
    drive: 0.05,
  },
  hyperpop: {
    kickStartHz: 130, // pitched up
    kickEndHz: 45,
    kickDecaySec: 0.22,
    kickClickHz: 5500,
    kickClickGain: 0.28,
    snareBandHz: 2400, // very bright
    snareBandQ: 1.4,
    snareBodyHz: 280,
    snareBodyGain: 0.38,
    snareDecaySec: 0.12,
    clapBandHpHz: 2000,
    hatHpHz: 11000,
    hatDecaySec: 0.04,
    openHatHpHz: 9500,
    openHatDecaySec: 0.25,
    percHz: 1800,
    percDecaySec: 0.05,
    bass808Hz: 70, // pitched up, less sub
    bass808DecaySec: 0.5,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 7000,
    crashDecaySec: 0.85,
    drive: 0.35, // distorted character
  },
  boomBap: {
    kickStartHz: 100,
    kickEndHz: 55, // mid-range, less sub
    kickDecaySec: 0.28,
    kickClickHz: 3200,
    kickClickGain: 0.2,
    snareBandHz: 1400,
    snareBandQ: 0.8,
    snareBodyHz: 240, // dusty body
    snareBodyGain: 0.5,
    snareDecaySec: 0.22,
    clapBandHpHz: 900, // darker
    hatHpHz: 6500,
    hatDecaySec: 0.06,
    openHatHpHz: 5500,
    openHatDecaySec: 0.45,
    percHz: 850,
    percDecaySec: 0.1,
    bass808Hz: 60, // not really 808-style; treat as low sub-pluck
    bass808DecaySec: 0.5,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 4500,
    crashDecaySec: 1.8,
    drive: 0.15,
  },
  lofi: {
    kickStartHz: 95,
    kickEndHz: 40,
    kickDecaySec: 0.28,
    kickClickHz: 2800,
    kickClickGain: 0.12,
    snareBandHz: 900,
    snareBandQ: 0.7,
    snareBodyHz: 180,
    snareBodyGain: 0.4,
    snareDecaySec: 0.18,
    clapBandHpHz: 800,
    hatHpHz: 5500,
    hatDecaySec: 0.05,
    openHatHpHz: 4500,
    openHatDecaySec: 0.35,
    percHz: 700,
    percDecaySec: 0.1,
    bass808Hz: 55,
    bass808DecaySec: 0.8,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 4000,
    crashDecaySec: 1.4,
    drive: 0.4,
  },
  acoustic: {
    kickStartHz: 110,
    kickEndHz: 35,
    kickDecaySec: 0.35,
    kickClickHz: 3000,
    kickClickGain: 0.15,
    snareBandHz: 1500,
    snareBandQ: 0.7,
    snareBodyHz: 200,
    snareBodyGain: 0.35,
    snareDecaySec: 0.18,
    clapBandHpHz: 1200,
    hatHpHz: 7000,
    hatDecaySec: 0.05,
    openHatHpHz: 6000,
    openHatDecaySec: 0.4,
    percHz: 1000,
    percDecaySec: 0.1,
    bass808Hz: 60,
    bass808DecaySec: 0.6,
    bass808SlideSemis: 0,
    bass808SlideTime: 0,
    crashHpHz: 5000,
    crashDecaySec: 1.5,
    drive: 0,
  },
};

/**
 * Schedule a single drum hit on the supplied destination node. Works in
 * both live AudioContext and OfflineAudioContext — the drawing-board
 * pattern of "give me a context and a destination, I'll wire one-shot
 * voices into it."
 */
export function scheduleDrumHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  kind: DrumKind,
  opts: VoiceOptions,
) {
  const { when, velocity = 1, kit = "acoustic", pitchSemis = 0 } = opts;
  const params = KITS[kit];

  // Optional saturation stage for lo-fi / hyperpop crunch. drive=0 ⇒ no
  // node inserted ⇒ no perf cost on clean kits.
  const out = params.drive > 0 ? createSaturator(ctx, params.drive) : null;
  if (out) out.connect(dest);
  const target: AudioNode = out ?? dest;

  switch (kind) {
    case "kick": {
      // Body — sine sweep that gives the kick its punch.
      const body = ctx.createOscillator();
      body.type = "sine";
      const bodyAmp = ctx.createGain();
      body.connect(bodyAmp).connect(target);
      body.frequency.setValueAtTime(params.kickStartHz, when);
      body.frequency.exponentialRampToValueAtTime(params.kickEndHz, when + 0.12);
      bodyAmp.gain.setValueAtTime(0.0001, when);
      bodyAmp.gain.exponentialRampToValueAtTime(0.95 * velocity, when + 0.005);
      bodyAmp.gain.exponentialRampToValueAtTime(0.0001, when + params.kickDecaySec);
      body.start(when);
      body.stop(when + params.kickDecaySec + 0.05);

      // Click — high-frequency transient that adds attack so the kick
      // cuts through a dense mix on phone speakers.
      if (params.kickClickGain > 0) {
        const click = createNoiseSource(ctx);
        const clickHp = ctx.createBiquadFilter();
        clickHp.type = "highpass";
        clickHp.frequency.value = params.kickClickHz;
        const clickAmp = ctx.createGain();
        click.connect(clickHp).connect(clickAmp).connect(target);
        clickAmp.gain.setValueAtTime(0.0001, when);
        clickAmp.gain.exponentialRampToValueAtTime(params.kickClickGain * velocity, when + 0.001);
        clickAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
        click.start(when);
        click.stop(when + 0.02);
      }
      break;
    }
    case "snare": {
      const noise = createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = params.snareBandHz;
      filter.Q.value = params.snareBandQ;
      const noiseAmp = ctx.createGain();
      noise.connect(filter).connect(noiseAmp).connect(target);
      noiseAmp.gain.setValueAtTime(0.0001, when);
      noiseAmp.gain.exponentialRampToValueAtTime(0.6 * velocity, when + 0.005);
      noiseAmp.gain.exponentialRampToValueAtTime(0.0001, when + params.snareDecaySec);
      noise.start(when);
      noise.stop(when + params.snareDecaySec + 0.02);

      const body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = params.snareBodyHz;
      const bodyAmp = ctx.createGain();
      body.connect(bodyAmp).connect(target);
      bodyAmp.gain.setValueAtTime(0.0001, when);
      bodyAmp.gain.exponentialRampToValueAtTime(params.snareBodyGain * velocity, when + 0.005);
      bodyAmp.gain.exponentialRampToValueAtTime(0.0001, when + params.snareDecaySec * 0.7);
      body.start(when);
      body.stop(when + params.snareDecaySec);
      break;
    }
    case "clap": {
      // Multi-tap clap. Tap timings per kit are fixed; perceived "looser"
      // claps come from the highpass + envelope, not jitter.
      const offsets = [0, 0.011, 0.024, 0.05];
      for (const off of offsets) {
        const noise = createNoiseSource(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = params.clapBandHpHz;
        const amp = ctx.createGain();
        noise.connect(filter).connect(amp).connect(target);
        const t = when + off;
        const peak = (off === 0.05 ? 0.42 : 0.58) * velocity;
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(peak, t + 0.002);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + (off === 0.05 ? 0.13 : 0.04));
        noise.start(t);
        noise.stop(t + (off === 0.05 ? 0.14 : 0.05));
      }
      break;
    }
    case "hat": {
      const noise = createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = params.hatHpHz;
      const amp = ctx.createGain();
      noise.connect(filter).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.32 * velocity, when + 0.001);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + params.hatDecaySec);
      noise.start(when);
      noise.stop(when + params.hatDecaySec + 0.01);
      break;
    }
    case "openHat": {
      const noise = createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = params.openHatHpHz;
      const amp = ctx.createGain();
      noise.connect(filter).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.4 * velocity, when + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + params.openHatDecaySec);
      noise.start(when);
      noise.stop(when + params.openHatDecaySec + 0.05);
      break;
    }
    case "perc": {
      // Pitched percussion — triangle pluck through bandpass for a
      // wood-block / shaker timbre. Plus a tiny noise bite on the attack
      // for snap.
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = params.percHz;
      const oscAmp = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = params.percHz;
      bp.Q.value = 2;
      osc.connect(bp).connect(oscAmp).connect(target);
      oscAmp.gain.setValueAtTime(0.0001, when);
      oscAmp.gain.exponentialRampToValueAtTime(0.4 * velocity, when + 0.002);
      oscAmp.gain.exponentialRampToValueAtTime(0.0001, when + params.percDecaySec);
      osc.start(when);
      osc.stop(when + params.percDecaySec + 0.02);

      const bite = createNoiseSource(ctx);
      const biteHp = ctx.createBiquadFilter();
      biteHp.type = "highpass";
      biteHp.frequency.value = 4000;
      const biteAmp = ctx.createGain();
      bite.connect(biteHp).connect(biteAmp).connect(target);
      biteAmp.gain.setValueAtTime(0.0001, when);
      biteAmp.gain.exponentialRampToValueAtTime(0.1 * velocity, when + 0.0005);
      biteAmp.gain.exponentialRampToValueAtTime(0.0001, when + 0.012);
      bite.start(when);
      bite.stop(when + 0.02);
      break;
    }
    case "bass808": {
      // Sub-bass tone. Sine osc + amp envelope. Optional pitch slide in
      // semitones — drill kits use this for the characteristic sliding
      // 808 line.
      const baseHz = params.bass808Hz * Math.pow(2, pitchSemis / 12);
      const startHz =
        params.bass808SlideSemis !== 0
          ? baseHz * Math.pow(2, params.bass808SlideSemis / 12)
          : baseHz;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(startHz, when);
      if (params.bass808SlideSemis !== 0 && params.bass808SlideTime > 0) {
        osc.frequency.exponentialRampToValueAtTime(
          baseHz,
          when + params.bass808SlideTime,
        );
      }
      const amp = ctx.createGain();
      osc.connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.85 * velocity, when + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + params.bass808DecaySec);
      osc.start(when);
      osc.stop(when + params.bass808DecaySec + 0.05);
      break;
    }
    case "crash": {
      // Long noise wash with a high-pass for shimmer.
      const noise = createNoiseSource(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = params.crashHpHz;
      const amp = ctx.createGain();
      noise.connect(hp).connect(amp).connect(target);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(0.32 * velocity, when + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + params.crashDecaySec);
      noise.start(when);
      noise.stop(when + params.crashDecaySec + 0.05);
      break;
    }
  }
}

/** Soft-knee saturator: WaveShaperNode with a tanh curve scaled by drive. */
function createSaturator(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const samples = 2048;
  const curve = new Float32Array(samples);
  const k = 1 + drive * 12; // 0 → 1 (linear), 0.4 → ~5.8 (gentle crunch)
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

/**
 * 1-second white-noise buffer source, regenerated each call. Cheap, and
 * regenerating per-hit avoids the audible repetition of replaying the
 * same buffer when many hits land in quick succession.
 */
function createNoiseSource(ctx: BaseAudioContext): AudioBufferSourceNode {
  const len = Math.floor(ctx.sampleRate * 1);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

/**
 * Render an entire beat pattern to an AudioBuffer offline. Used by the
 * "Render to Beat track" button — the pattern bakes into a stem the
 * mixer treats as any other recorded track.
 */
export async function renderPatternToBuffer(
  pattern: BeatPattern,
  bpm: number,
  bars: number = 1,
  sampleRate: number = 44100,
  kit: DrumKitId = "acoustic",
): Promise<AudioBuffer> {
  const stepSec = 60 / bpm / STEPS_PER_BEAT;
  const totalSteps = STEPS * bars;
  // Crash + 808 tails can be 1.5s+ on some kits; pad accordingly.
  const totalSec = totalSteps * stepSec + 2.0;
  const offline = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);

  for (let bar = 0; bar < bars; bar++) {
    for (let step = 0; step < STEPS; step++) {
      const when = (bar * STEPS + step) * stepSec;
      for (const lane of DRUM_LANES) {
        if (pattern[lane][step]) {
          scheduleDrumHit(offline, offline.destination, lane, { when, kit });
        }
      }
    }
  }
  return offline.startRendering();
}
