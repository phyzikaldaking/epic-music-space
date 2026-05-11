"use client";

/** Lightweight client-side pitch correction (#13).
 *
 *  Detects the fundamental of each frame via autocorrelation, snaps to
 *  the nearest semitone in the chosen scale, and applies a per-frame
 *  PSOLA-lite shift. This is "soft" correction — noticeably tightens a
 *  wandering vocal, but won't sound like commercial auto-tune. Keep
 *  expectations honest: the win is "free + private + works offline" not
 *  "best-in-class quality." */

const FRAME_SIZE = 2048;
const HOP = 512;
const A4_HZ = 440;
const A4_MIDI = 69;

export type ScaleKey =
  | "C"
  | "G"
  | "D"
  | "A"
  | "E"
  | "B"
  | "F#"
  | "F"
  | "Bb"
  | "Eb"
  | "Ab"
  | "Db";

const KEY_TO_PC: Record<ScaleKey, number> = {
  C: 0,
  G: 7,
  D: 2,
  A: 9,
  E: 4,
  B: 11,
  "F#": 6,
  F: 5,
  Bb: 10,
  Eb: 3,
  Ab: 8,
  Db: 1,
};

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];

/** Estimate the fundamental frequency of a frame via autocorrelation.
 *  Returns 0 when no clear pitch is found (silence, noise). */
export function detectPitchHz(
  frame: Float32Array,
  sampleRate: number,
): number {
  // Autocorrelation between minLag (high frequency) and maxLag (low).
  const minLag = Math.floor(sampleRate / 800); // ~800 Hz upper bound
  const maxLag = Math.floor(sampleRate / 70); // ~70 Hz lower bound
  let bestLag = -1;
  let bestCorr = 0;
  // Quick energy gate — don't try to pitch-track silence.
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy / frame.length < 1e-4) return 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const limit = frame.length - lag;
    for (let i = 0; i < limit; i++) corr += frame[i] * frame[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0) return 0;
  return sampleRate / bestLag;
}

/** Closest semitone in the given key/scale (major triad mapping).
 *  When two candidates are equidistant from the input midi (e.g. a
 *  perfectly between-two-notes pitch), prefer the *lower* candidate so
 *  the snap is deterministic and never drifts upward on neutral input
 *  (#18). Iterating from low offset to high also resolves ties at the
 *  outermost ±6 toward the lower note. */
function snapToScale(midi: number, key: ScaleKey): number {
  const root = KEY_TO_PC[key];
  let best = midi;
  let bestDist = Infinity;
  for (let offset = -6; offset <= 6; offset++) {
    const candidate = Math.round(midi + offset);
    const interval = ((candidate - root) % 12 + 12) % 12;
    if (!MAJOR_SCALE_INTERVALS.includes(interval)) continue;
    const dist = Math.abs(candidate - midi);
    if (dist < bestDist || (dist === bestDist && candidate < best)) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

function hzToMidi(hz: number): number {
  return 12 * Math.log2(hz / A4_HZ) + A4_MIDI;
}

function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Apply soft pitch correction: detect each frame's pitch, snap to the
 *  scale, resample the frame to shift by the resulting ratio, blend with
 *  the original by `amount` (0 = bypass, 1 = full correction). */
export function applyPitchCorrection(
  buffer: AudioBuffer,
  ctx: AudioContext,
  options: { key: ScaleKey; amount: number },
): AudioBuffer {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const out = ctx.createBuffer(channels, length, sampleRate);

  // Mix to mono for pitch detection (cheaper) but apply per-channel.
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }

  const amount = Math.max(0, Math.min(1, options.amount));
  const inChannels: Float32Array[] = [];
  const outChannels: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    inChannels.push(buffer.getChannelData(c));
    outChannels.push(out.getChannelData(c));
  }

  // Sliding-frame analysis. For each frame: detect pitch, compute target
  // ratio, write the shifted frame into the output. Adjacent frames are
  // crossfaded over HOP samples to hide seams.
  //
  // Constant-overlap-add (COLA) bookkeeping (#6). With per-frame Hann
  // windowing AND a final OLA divisor we were applying the window twice
  // and amplifying the output by ~1.5–2×. Instead we accumulate the
  // window envelope alongside the audio and divide the final sample by
  // its actual envelope at that index — no guess factor, no double gain.
  const window = makeHannWindow(FRAME_SIZE);
  const frame = new Float32Array(FRAME_SIZE);
  const envelope = new Float32Array(length);

  for (let start = 0; start + FRAME_SIZE < length; start += HOP) {
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = mono[start + i];
    const hz = detectPitchHz(frame, sampleRate);
    let ratio = 1;
    if (hz > 0) {
      const midi = hzToMidi(hz);
      const targetMidi = snapToScale(midi, options.key);
      const targetHz = midiToHz(targetMidi);
      ratio = targetHz / hz;
      // Clamp: don't move more than one semitone — anything wider sounds
      // robotic with this naive resampler, which gives the soft mode its
      // honest quality bar.
      ratio = Math.max(Math.pow(2, -1 / 12), Math.min(Math.pow(2, 1 / 12), ratio));
    }

    for (let c = 0; c < channels; c++) {
      const input = inChannels[c];
      const output = outChannels[c];
      for (let i = 0; i < FRAME_SIZE; i++) {
        const srcOffset = i / ratio;
        const srcIndex = start + srcOffset;
        const i0 = Math.floor(srcIndex);
        const i1 = Math.min(length - 1, i0 + 1);
        const t = srcIndex - i0;
        const corrected =
          (i0 >= 0 && i0 < length ? input[i0] : 0) * (1 - t) +
          (i1 >= 0 && i1 < length ? input[i1] : 0) * t;
        const dry = input[start + i] ?? 0;
        const wet = corrected;
        const w = window[i];
        output[start + i] += (dry * (1 - amount) + wet * amount) * w;
        // Track envelope only on the first channel pass; it's the same
        // for every channel because we use the same window.
        if (c === 0) envelope[start + i] += w;
      }
    }
  }

  // Divide each output sample by its actual accumulated envelope. Where
  // the envelope is ~0 (the very first/last samples that no frame
  // covered) we leave the output untouched — that region is silence
  // by construction, so 0/0 = 0 is the right answer.
  for (let c = 0; c < channels; c++) {
    const ch = outChannels[c];
    for (let i = 0; i < length; i++) {
      const env = envelope[i];
      if (env > 1e-6) ch[i] /= env;
    }
  }

  return out;
}

// ─── AI Melodyne: note-level pitch editing ────────────────────────────
//
// `extractPitchContour` runs autocorrelation on every HOP and returns the
// per-frame pitch + RMS, mapped to a frame index that the MelodyneEditor
// uses to draw a piano-roll-of-audio.
//
// `segmentNotes` walks the contour, groups consecutive frames whose pitch
// is within ~50 cents of each other into a single Note. Each note has a
// detected midi (median) and an editable `targetMidi` (defaults to the
// nearest scale snap). The editor lets the singer drag `targetMidi`
// vertically to retune individual notes.
//
// `applyMelodyne` does the inverse of `applyPitchCorrection`: instead of
// re-snapping every frame, each frame gets the ratio implied by the
// containing note's `(targetMidi / detectedMidi)` so a single note moves
// as a unit. Naive linear resampler again — same soft-mode quality bar.

export interface PitchedFrame {
  /** Sample index of the frame start. */
  startSample: number;
  /** Detected pitch in Hz, or 0 if the frame is silent / pitchless. */
  hz: number;
  /** RMS amplitude of the frame, 0..1. */
  rms: number;
}

export interface MelodyneNote {
  /** Sample index where this note starts. */
  startSample: number;
  /** Sample index where this note ends (exclusive). */
  endSample: number;
  /** Median detected MIDI note across this segment. */
  detectedMidi: number;
  /** Editable target MIDI — what we tune the note to. */
  targetMidi: number;
  /** Average RMS across this note (for editor visualization). */
  rms: number;
}

export function extractPitchContour(
  buffer: AudioBuffer,
  options: { hop?: number } = {},
): PitchedFrame[] {
  const hop = options.hop ?? HOP;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const channels = buffer.numberOfChannels;

  // Mono mix for analysis. Float32 sum scaled by 1/numChannels.
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }

  const frame = new Float32Array(FRAME_SIZE);
  const frames: PitchedFrame[] = [];
  for (let start = 0; start + FRAME_SIZE < length; start += hop) {
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = mono[start + i];
    let energy = 0;
    for (let i = 0; i < FRAME_SIZE; i++) energy += frame[i] * frame[i];
    const rms = Math.sqrt(energy / FRAME_SIZE);
    const hz = detectPitchHz(frame, sampleRate);
    frames.push({ startSample: start, hz, rms });
  }
  return frames;
}

export function segmentNotes(
  contour: PitchedFrame[],
  options: { key?: ScaleKey; minNoteFrames?: number; centsTolerance?: number } = {},
): MelodyneNote[] {
  const key = options.key ?? "C";
  const minNoteFrames = options.minNoteFrames ?? 3;
  const centsTol = options.centsTolerance ?? 60;
  const notes: MelodyneNote[] = [];

  let runStart = -1;
  let runFrames: PitchedFrame[] = [];
  let runMidiSum = 0;

  const flush = (endIdx: number) => {
    if (runStart < 0 || runFrames.length < minNoteFrames) {
      runStart = -1;
      runFrames = [];
      runMidiSum = 0;
      return;
    }
    const midis = runFrames.map((f) => hzToMidi(f.hz)).sort((a, b) => a - b);
    const median = midis[Math.floor(midis.length / 2)];
    const startSample = runFrames[0].startSample;
    const endSample =
      endIdx >= 0 && endIdx < contour.length
        ? contour[endIdx].startSample
        : runFrames[runFrames.length - 1].startSample + FRAME_SIZE;
    const rmsAvg =
      runFrames.reduce((acc, f) => acc + f.rms, 0) / runFrames.length;
    notes.push({
      startSample,
      endSample,
      detectedMidi: median,
      targetMidi: snapToScale(median, key),
      rms: rmsAvg,
    });
    runStart = -1;
    runFrames = [];
    runMidiSum = 0;
  };

  for (let i = 0; i < contour.length; i++) {
    const f = contour[i];
    if (f.hz <= 0 || f.rms < 0.01) {
      flush(i);
      continue;
    }
    const midi = hzToMidi(f.hz);
    if (runStart < 0) {
      runStart = i;
      runFrames = [f];
      runMidiSum = midi;
      continue;
    }
    const avgMidi = runMidiSum / runFrames.length;
    const cents = Math.abs(midi - avgMidi) * 100;
    if (cents > centsTol) {
      flush(i);
      runStart = i;
      runFrames = [f];
      runMidiSum = midi;
    } else {
      runFrames.push(f);
      runMidiSum += midi;
    }
  }
  flush(contour.length);
  return notes;
}

export function applyMelodyne(
  buffer: AudioBuffer,
  ctx: AudioContext,
  notes: MelodyneNote[],
  options: { amount?: number } = {},
): AudioBuffer {
  const amount = Math.max(0, Math.min(1, options.amount ?? 1));
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const out = ctx.createBuffer(channels, length, sampleRate);

  // Build a lookup of sample → ratio. Outside any note, ratio = 1
  // (dry). Inside a note, ratio = targetHz / detectedHz. Clamped to
  // ±2 semitones because anything wider sounds robotic with naive
  // resampling (Melodyne-grade would need WORLD or RubberBand).
  const ratioBySample = new Float32Array(length);
  ratioBySample.fill(1);
  for (const n of notes) {
    if (n.targetMidi === n.detectedMidi) continue;
    const tHz = midiToHz(n.targetMidi);
    const dHz = midiToHz(n.detectedMidi);
    let r = tHz / dHz;
    r = Math.max(Math.pow(2, -2 / 12), Math.min(Math.pow(2, 2 / 12), r));
    const from = Math.max(0, n.startSample);
    const to = Math.min(length, n.endSample);
    for (let i = from; i < to; i++) ratioBySample[i] = r;
  }

  // Per-channel pass. Linear interp; this matches the soft-correction
  // quality bar.
  for (let c = 0; c < channels; c++) {
    const input = buffer.getChannelData(c);
    const output = out.getChannelData(c);
    let srcCursor = 0; // accumulated source position
    for (let i = 0; i < length; i++) {
      const ratio = ratioBySample[i];
      const j0 = Math.floor(srcCursor);
      const j1 = Math.min(length - 1, j0 + 1);
      const t = srcCursor - j0;
      const wet =
        (j0 >= 0 && j0 < length ? input[j0] : 0) * (1 - t) +
        (j1 >= 0 && j1 < length ? input[j1] : 0) * t;
      const dry = input[i];
      output[i] = dry * (1 - amount) + wet * amount;
      // Source cursor walks at 1/ratio so the *output* sample i lands
      // on the right place in the input.
      srcCursor += 1 / ratio;
      if (srcCursor < 0) srcCursor = 0;
      if (srcCursor >= length - 1) srcCursor = length - 1;
    }
  }
  return out;
}

function makeHannWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}
