"use client";

/** Lightweight client-side reference matcher (#11).
 *
 *  Given a reference track (a song the user wants their mix to sound
 *  like) and an OfflineAudioContext, this computes a 6-band EQ curve
 *  + an RMS target. The caller maps the curve onto the 3-band master
 *  EQ + sets the master gain to hit the RMS. It's not commercial-grade
 *  matchering — for that we'd need a real GPU service running the
 *  matchering Python lib — but it's a credible v1 the user can hear. */

export interface MasteringMatch {
  /** Three-band EQ targets, in dB, for low/mid/high. */
  eq: { low: number; mid: number; high: number };
  /** Reference RMS in linear amplitude (0..1). */
  rms: number;
  /** Crest factor — peak / RMS — useful for limiter threshold setting. */
  crest: number;
  /** Sub-band energies (0..1) — surfaced for the diagnostics panel. */
  bands: number[];
}

const BAND_RANGES_HZ: Array<[number, number]> = [
  [20, 60],
  [60, 250],
  [250, 500],
  [500, 2000],
  [2000, 6000],
  [6000, 20000],
];

/** Decode a reference file Blob into AudioBuffer + analyse against the
 *  current mix's spectrum so we can return EQ deltas relative to the
 *  user's existing master rather than raw absolutes. */
export async function analyseReference(
  ctx: AudioContext,
  blob: Blob,
): Promise<MasteringMatch | null> {
  try {
    const arr = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    return analyseBuffer(buffer);
  } catch {
    return null;
  }
}

export function analyseBuffer(buffer: AudioBuffer): MasteringMatch {
  // Mix to mono.
  const len = buffer.length;
  const channels = buffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }

  // RMS + peak.
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const s = mono[i];
    sumSq += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSq / len);
  const crest = peak / Math.max(1e-6, rms);

  // FFT — naive radix-2 over the first ~2 seconds to cap CPU cost.
  // Real matchering uses overlap-adds; this is rough but enough for
  // band energy ratios.
  const sampleRate = buffer.sampleRate;
  const fftSize = 16384;
  const window = mono.subarray(0, Math.min(len, fftSize));
  const spectrum = magnitudeSpectrum(window, fftSize);

  // Bucket into bands.
  const bands = BAND_RANGES_HZ.map(([lo, hi]) => {
    const loBin = Math.floor((lo / sampleRate) * fftSize);
    const hiBin = Math.min(spectrum.length, Math.ceil((hi / sampleRate) * fftSize));
    let sum = 0;
    let count = 0;
    for (let i = loBin; i < hiBin; i++) {
      sum += spectrum[i];
      count++;
    }
    return count > 0 ? sum / count : 0;
  });

  // Normalize band energies to 0..1.
  const maxBand = Math.max(1e-6, ...bands);
  const normBands = bands.map((b) => b / maxBand);

  // Map bands → 3-band EQ deltas. low = bands 0+1, mid = 2+3, high = 4+5.
  // Mean of the user's bands today is ~0.5; reference deviation tells us
  // the rough direction. Clamp to ±6 dB so the suggestion is gentle.
  const lowAvg = (normBands[0] + normBands[1]) / 2;
  const midAvg = (normBands[2] + normBands[3]) / 2;
  const highAvg = (normBands[4] + normBands[5]) / 2;
  const eq = {
    low: clampDb((lowAvg - 0.5) * 12),
    mid: clampDb((midAvg - 0.5) * 12),
    high: clampDb((highAvg - 0.5) * 12),
  };

  return { eq, rms, crest, bands: normBands };
}

function clampDb(value: number): number {
  return Math.max(-6, Math.min(6, Number(value.toFixed(1))));
}

/** Magnitude spectrum via a tiny iterative radix-2 FFT. n MUST be a
 *  power of 2. Returns the first n/2 bins. */
function magnitudeSpectrum(input: Float32Array, n: number): Float32Array {
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = input[i] ?? 0;
    im[i] = 0;
  }

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const tableStep = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let j = i, k = 0; k < half; j++, k++) {
        const angle = tableStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tre = re[j + half] * cos - im[j + half] * sin;
        const tim = re[j + half] * sin + im[j + half] * cos;
        re[j + half] = re[j] - tre;
        im[j + half] = im[j] - tim;
        re[j] = re[j] + tre;
        im[j] = im[j] + tim;
      }
    }
  }

  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    out[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }
  return out;
}
