export type LufsWindow = { momentary: number; shortTerm: number; integrated: number; loudnessRange: number };
export type CorrelationResult = { correlation: number; monoCompatible: boolean; antiPhaseRisk: boolean };
export type HarmonicSeparationResult = { harmonic: Float32Array; percussive: Float32Array; transient: Float32Array; tonalMasking: number };

function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length));
}

function peak(samples: Float32Array) {
  return samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
}

function lufsFromRms(value: number) {
  return -0.691 + 10 * Math.log10(Math.max(0.0000001, value * value));
}

export function computeEbuR128Approx(samples: Float32Array, sampleRate = 44100): LufsWindow {
  const momentarySize = Math.max(1, Math.floor(sampleRate * 0.4));
  const shortSize = Math.max(1, Math.floor(sampleRate * 3));
  const windows: number[] = [];
  for (let start = 0; start < samples.length; start += momentarySize) windows.push(lufsFromRms(rms(samples.slice(start, Math.min(samples.length, start + momentarySize)))));
  const gated = windows.filter((value) => value > -70);
  const integrated = gated.length ? gated.reduce((sum, value) => sum + value, 0) / gated.length : -70;
  const sorted = [...gated].sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.1)] ?? integrated;
  const high = sorted[Math.floor(sorted.length * 0.95)] ?? integrated;
  return {
    momentary: lufsFromRms(rms(samples.slice(-momentarySize))),
    shortTerm: lufsFromRms(rms(samples.slice(-shortSize))),
    integrated,
    loudnessRange: Math.max(0, high - low),
  };
}

export function correlationMeter(left: Float32Array, right: Float32Array): CorrelationResult {
  const length = Math.min(left.length, right.length);
  let sumLR = 0;
  let sumL2 = 0;
  let sumR2 = 0;
  for (let index = 0; index < length; index += 1) {
    sumLR += left[index] * right[index];
    sumL2 += left[index] * left[index];
    sumR2 += right[index] * right[index];
  }
  const correlation = sumLR / Math.max(0.000001, Math.sqrt(sumL2 * sumR2));
  return { correlation, monoCompatible: correlation > 0.15, antiPhaseRisk: correlation < -0.2 };
}

export function vectorscopeOrbit(left: Float32Array, right: Float32Array, points = 96) {
  const length = Math.min(left.length, right.length);
  return Array.from({ length: points }, (_, point) => {
    const index = Math.floor((point / points) * length);
    const mid = (left[index] + right[index]) / 2;
    const side = (left[index] - right[index]) / 2;
    return { x: mid, y: side, angle: Math.atan2(side, mid), radius: Math.sqrt(mid * mid + side * side) };
  });
}

export function harmonicPercussiveSeparation(samples: Float32Array): HarmonicSeparationResult {
  const harmonic = new Float32Array(samples.length);
  const percussive = new Float32Array(samples.length);
  const transient = new Float32Array(samples.length);
  let smooth = 0;
  let previous = 0;
  for (let index = 0; index < samples.length; index += 1) {
    smooth += 0.015 * (samples[index] - smooth);
    harmonic[index] = smooth;
    percussive[index] = samples[index] - smooth;
    transient[index] = Math.max(0, Math.abs(samples[index] - previous) - 0.05);
    previous = samples[index];
  }
  const tonalMasking = rms(harmonic) / Math.max(0.0001, peak(percussive));
  return { harmonic, percussive, transient, tonalMasking };
}

export function spectralAiSuggestions(input: { lufs: LufsWindow; correlation: CorrelationResult; separation: HarmonicSeparationResult }) {
  const suggestions: string[] = [];
  if (input.lufs.integrated < -16) suggestions.push("Raise integrated loudness with gentle bus gain before limiting.");
  if (input.lufs.integrated > -8) suggestions.push("Reduce limiter pressure to preserve punch and streaming headroom.");
  if (input.correlation.antiPhaseRisk) suggestions.push("Narrow stereo width or inspect phase-inverted elements before export.");
  if (input.separation.tonalMasking > 1.4) suggestions.push("Cut low-mid buildup or sidechain harmonic beds against drums.");
  if (!suggestions.length) suggestions.push("Master balance looks stable. Focus on creative polish and reference matching.");
  return suggestions;
}

export function supportsWebGpuFft() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function supportsWebGlSpectrogram(canvas: HTMLCanvasElement | null) {
  return Boolean(canvas?.getContext("webgl2") ?? canvas?.getContext("webgl"));
}
