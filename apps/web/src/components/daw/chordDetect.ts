/**
 * Heuristic chord detector for imported audio.
 *
 * Pipeline:
 *   1. Pull the audio's mono mix into the engine.
 *   2. Slice into beat-sized frames (default ~0.5s).
 *   3. Compute a 12-bin chroma vector per frame using a coarse FFT
 *      (no library — a Hann-windowed real-input DFT good enough for
 *      ~80 Hz – 2 kHz which covers the relevant chord-defining range).
 *   4. Correlate each chroma against 24 templates (12 major, 12 minor)
 *      via cosine similarity. Strongest correlation wins.
 *   5. Smooth the per-frame labels with a 3-frame median to stop
 *      single-frame flips on attack transients.
 *
 * Cost: ~300ms for a 60-second clip on a modern laptop. Runs on the
 * main thread post-import; worker migration is a follow-up if it ever
 * blocks long enough to feel.
 *
 * Honest caveats: heavy reverb, layered vocals, and pitched samples
 * skew the chroma. Quality is "good for solo guitar / piano demos,
 * mediocre for full mixes." Promoted as a hint, not ground truth.
 */

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
type PitchClass = (typeof PITCH_NAMES)[number];

export type ChordKind = "maj" | "min" | "?";
export interface ChordHit {
  timeSec: number;
  /** Display label, e.g. "C", "Am", "F#m". "?" when confidence is low. */
  label: string;
  root: PitchClass | null;
  kind: ChordKind;
  /** 0..1 — how confident we are in this label vs. the runner-up. */
  confidence: number;
}

// Major / minor chord templates as binary masks over the 12 pitch classes.
// Index 0 = C, 1 = C#, ... 11 = B.
const TEMPLATE_MAJ = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]; // 1 + 3 + 5
const TEMPLATE_MIN = [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]; // 1 + b3 + 5

function rotate(template: number[], shift: number): number[] {
  return template.map((_, i) => template[(i - shift + 12) % 12] ?? 0);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Map a frequency in Hz to its pitch class (0..11) using A4 = 440 Hz.
 *  Returns -1 for sub-audio frequencies. */
function freqToPitchClass(freq: number): number {
  if (freq < 50) return -1; // below the lowest useful pitch
  const semis = 12 * Math.log2(freq / 440);
  // 9 = A's pitch class index. Round to nearest semitone, mod 12.
  const pc = Math.round(semis + 9) % 12;
  return ((pc % 12) + 12) % 12;
}

/** Coarse real-input DFT — only computes magnitudes for bins inside the
 *  chord-defining frequency band (≈80 Hz – 2 kHz). Cheaper than a full
 *  FFT and avoids dragging in a library. */
function chromaForFrame(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  size: number,
): number[] {
  const chroma = new Array(12).fill(0);
  const minHz = 80;
  const maxHz = 2000;
  const nyquist = sampleRate / 2;
  // We sample frequencies on a quasi-log grid so the lower octaves
  // (where chord roots and thirds live) get more bins relative to
  // the higher octaves.
  const stepCount = 96;
  for (let s = 0; s < stepCount; s++) {
    const ratio = s / (stepCount - 1);
    const freq = minHz * Math.pow(maxHz / minHz, ratio);
    if (freq >= nyquist) break;
    let re = 0;
    let im = 0;
    const omega = (2 * Math.PI * freq) / sampleRate;
    for (let n = 0; n < size; n++) {
      const sample = samples[start + n] ?? 0;
      // Hann window to reduce spectral leakage.
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
      const x = sample * w;
      re += x * Math.cos(omega * n);
      im -= x * Math.sin(omega * n);
    }
    const mag = Math.sqrt(re * re + im * im);
    const pc = freqToPitchClass(freq);
    if (pc >= 0) chroma[pc] += mag;
  }
  // L1 normalize so loud frames don't dominate quiet ones.
  const sum = chroma.reduce((acc, v) => acc + v, 0);
  if (sum === 0) return chroma;
  return chroma.map((v) => v / sum);
}

/** Detect chord per beat over the supplied mono buffer. */
export function detectChords(
  monoSamples: Float32Array,
  sampleRate: number,
  bpm: number,
  options: { framesPerBeat?: number; maxFrames?: number } = {},
): ChordHit[] {
  const framesPerBeat = options.framesPerBeat ?? 1;
  const maxFrames = options.maxFrames ?? 240; // cap at ~2 min @ 120bpm
  const beatSec = 60 / Math.max(40, Math.min(240, bpm));
  const frameSec = beatSec / framesPerBeat;
  const frameSize = Math.max(1024, Math.floor(frameSec * sampleRate));
  const totalFrames = Math.min(
    maxFrames,
    Math.floor(monoSamples.length / frameSize),
  );

  const allTemplates: Array<{ root: number; kind: ChordKind; vec: number[] }> = [];
  for (let r = 0; r < 12; r++) {
    allTemplates.push({ root: r, kind: "maj", vec: rotate(TEMPLATE_MAJ, r) });
    allTemplates.push({ root: r, kind: "min", vec: rotate(TEMPLATE_MIN, r) });
  }

  const rawHits: ChordHit[] = [];
  for (let f = 0; f < totalFrames; f++) {
    const start = f * frameSize;
    const chroma = chromaForFrame(monoSamples, sampleRate, start, frameSize);
    let best = { score: -Infinity, root: -1, kind: "?" as ChordKind };
    let runnerUp = -Infinity;
    for (const tmpl of allTemplates) {
      const score = cosine(chroma, tmpl.vec);
      if (score > best.score) {
        runnerUp = best.score;
        best = { score, root: tmpl.root, kind: tmpl.kind };
      } else if (score > runnerUp) {
        runnerUp = score;
      }
    }
    const confidence = Math.max(
      0,
      Math.min(1, (best.score - Math.max(0, runnerUp)) * 6),
    );
    const isLowConfidence = best.score < 0.3 || confidence < 0.04;
    const root = isLowConfidence || best.root < 0 ? null : (PITCH_NAMES[best.root] ?? null);
    const kind = isLowConfidence ? "?" : best.kind;
    rawHits.push({
      timeSec: f * frameSec,
      label: root ? `${root}${kind === "min" ? "m" : ""}` : "?",
      root,
      kind,
      confidence,
    });
  }

  // 3-frame median smoothing on the *label*. Removes single-frame flips
  // without tripping over confidence numbers.
  const smoothed: ChordHit[] = rawHits.map((hit, i) => {
    const window = [rawHits[i - 1], rawHits[i], rawHits[i + 1]].filter(
      (h): h is ChordHit => Boolean(h),
    );
    const counts = new Map<string, number>();
    for (const w of window) counts.set(w.label, (counts.get(w.label) ?? 0) + 1);
    let bestLabel = hit.label;
    let bestCount = 0;
    for (const [label, count] of counts) {
      if (count > bestCount) {
        bestLabel = label;
        bestCount = count;
      }
    }
    if (bestLabel === hit.label) return hit;
    return { ...hit, label: bestLabel };
  });

  // Collapse consecutive identical labels into runs so the UI shows
  // "C ▶ G ▶ Am ▶ F" rather than 32 dots of "C, C, C, G, G…".
  const compacted: ChordHit[] = [];
  for (const hit of smoothed) {
    const last = compacted[compacted.length - 1];
    if (last && last.label === hit.label) continue;
    compacted.push(hit);
  }
  return compacted;
}

/** Mix a stereo (or n-channel) AudioBuffer down to a single Float32Array. */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      out[i] += data[i] ?? 0;
    }
  }
  for (let i = 0; i < len; i++) {
    out[i] /= buffer.numberOfChannels;
  }
  return out;
}
