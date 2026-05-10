// Pure-math core for matchering — usable in both the main thread (back-
// compat for callers that already imported analyseBuffer) and the Web
// Worker variant added in #14. No browser-only globals (AudioContext,
// AudioBuffer) are referenced here; the caller mixes to mono and passes
// a Float32Array.

export interface MasteringMatch {
  eq: { low: number; mid: number; high: number };
  rms: number;
  crest: number;
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

const FFT_SIZE = 16384;

export function analyseMonoSamples(
  mono: Float32Array,
  sampleRate: number,
): MasteringMatch {
  const len = mono.length;
  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const s = mono[i];
    sumSq += s * s;
    const abs = Math.abs(s);
    if (abs > peak) peak = abs;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, len));
  const crest = peak / Math.max(1e-6, rms);

  const window = mono.subarray(0, Math.min(len, FFT_SIZE));
  const spectrum = magnitudeSpectrum(window, FFT_SIZE);

  const bands = BAND_RANGES_HZ.map(([lo, hi]) => {
    const loBin = Math.floor((lo / sampleRate) * FFT_SIZE);
    const hiBin = Math.min(
      spectrum.length,
      Math.ceil((hi / sampleRate) * FFT_SIZE),
    );
    let sum = 0;
    let count = 0;
    for (let i = loBin; i < hiBin; i++) {
      sum += spectrum[i];
      count++;
    }
    return count > 0 ? sum / count : 0;
  });

  const maxBand = Math.max(1e-6, ...bands);
  const normBands = bands.map((b) => b / maxBand);

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
