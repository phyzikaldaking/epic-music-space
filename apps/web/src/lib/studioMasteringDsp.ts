function normalizeSamples(samples: Float32Array) {
  const normalized = new Float32Array(samples.length);
  normalized.set(samples);
  return normalized;
}

export function softClip(sample: number, drive = 1.35) {
  return Math.tanh(sample * drive) * 0.92;
}

export function spectralEq(samples: Float32Array) {
  const source = normalizeSamples(samples);
  const out = new Float32Array(source.length);
  let low = 0;
  let mid = 0;
  for (let i = 0; i < source.length; i += 1) {
    low += 0.035 * (source[i] - low);
    mid += 0.12 * (source[i] - mid);
    const high = source[i] - mid;
    out[i] = low * 0.96 + (mid - low) * 1.04 + high * 1.08;
  }
  return out;
}

export function convolutionImpulse(samples: Float32Array, amount = 0.06) {
  const source = normalizeSamples(samples);
  const taps = [0.42, 0.24, 0.14, 0.08, 0.045, 0.025];
  const delays = [911, 1619, 3203, 5717, 8741, 13219];
  const out = new Float32Array(source.length);
  out.set(source);
  for (let i = 0; i < source.length; i += 1) {
    let wet = 0;
    for (let t = 0; t < taps.length; t += 1) if (i > delays[t]) wet += source[i - delays[t]] * taps[t];
    out[i] = source[i] * (1 - amount) + wet * amount;
  }
  return out;
}

export function timeStretchPreview(samples: Float32Array, ratio = 1) {
  const source = normalizeSamples(samples);
  if (Math.abs(ratio - 1) < 0.01) return source;
  const out = new Float32Array(Math.max(1, Math.floor(source.length * ratio)));
  for (let i = 0; i < out.length; i += 1) {
    const sourceIndex = i / ratio;
    const left = Math.floor(sourceIndex);
    const frac = sourceIndex - left;
    out[i] = (source[left] ?? 0) * (1 - frac) + (source[left + 1] ?? 0) * frac;
  }
  return out;
}

export function pitchCorrectionPreview(samples: Float32Array, strength = 0.012) {
  const source = normalizeSamples(samples);
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = source[i] - Math.sin(source[i] * Math.PI) * strength;
  return out;
}

export function masteringGraph(samples: Float32Array) {
  let processed: Float32Array = spectralEq(samples);
  processed = convolutionImpulse(processed, 0.045);
  processed = timeStretchPreview(processed, 1);
  processed = pitchCorrectionPreview(processed, 0.012);
  let peak = 0;
  for (const sample of processed) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? Math.min(1.8, 0.9 / peak) : 1;
  const mastered = new Float32Array(processed.length);
  let envelope = 0;
  for (let index = 0; index < processed.length; index += 1) {
    const input = processed[index] * gain;
    envelope = Math.max(Math.abs(input), envelope * 0.997);
    const compressed = input / (1 + Math.max(0, envelope - 0.62) * 1.8);
    mastered[index] = softClip(compressed);
  }
  return mastered;
}
