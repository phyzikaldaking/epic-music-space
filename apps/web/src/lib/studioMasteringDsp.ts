export function softClip(sample: number, drive = 1.35) {
  return Math.tanh(sample * drive) * 0.92;
}

export function spectralEq(samples: Float32Array) {
  const out = new Float32Array(samples.length);
  let low = 0;
  let mid = 0;
  for (let i = 0; i < samples.length; i += 1) {
    low += 0.035 * (samples[i] - low);
    mid += 0.12 * (samples[i] - mid);
    const high = samples[i] - mid;
    out[i] = low * 0.96 + (mid - low) * 1.04 + high * 1.08;
  }
  return out;
}

export function convolutionImpulse(samples: Float32Array, amount = 0.06) {
  const taps = [0.42, 0.24, 0.14, 0.08, 0.045, 0.025];
  const delays = [911, 1619, 3203, 5717, 8741, 13219];
  const out = new Float32Array(samples);
  for (let i = 0; i < samples.length; i += 1) {
    let wet = 0;
    for (let t = 0; t < taps.length; t += 1) if (i > delays[t]) wet += samples[i - delays[t]] * taps[t];
    out[i] = samples[i] * (1 - amount) + wet * amount;
  }
  return out;
}

export function timeStretchPreview(samples: Float32Array, ratio = 1) {
  if (Math.abs(ratio - 1) < 0.01) return samples;
  const out = new Float32Array(Math.max(1, Math.floor(samples.length * ratio)));
  for (let i = 0; i < out.length; i += 1) {
    const source = i / ratio;
    const left = Math.floor(source);
    const frac = source - left;
    out[i] = (samples[left] ?? 0) * (1 - frac) + (samples[left + 1] ?? 0) * frac;
  }
  return out;
}

export function pitchCorrectionPreview(samples: Float32Array, strength = 0.012) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] - Math.sin(samples[i] * Math.PI) * strength;
  return out;
}

export function masteringGraph(samples: Float32Array) {
  let processed = spectralEq(samples);
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
