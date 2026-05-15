export type ComplexBin = { re: number; im: number; magnitude: number; phase: number };
export type PitchDetectionResult = { frequency: number; midi: number; cents: number; confidence: number };
export type AutomationPoint = { time: number; value: number };
export type AutomationLane = { parameterId: string; points: AutomationPoint[] };
export type PluginAutomationFrame = { time: number; values: Record<string, number> };

export function hannWindow(size: number) {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i += 1) window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, size - 1)));
  return window;
}

export function spectralAnalysis(samples: Float32Array, fftSize = 2048) {
  const size = Math.min(fftSize, samples.length);
  const window = hannWindow(size);
  const bins: ComplexBin[] = [];
  for (let k = 0; k < size / 2; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < size; n += 1) {
      const angle = (2 * Math.PI * k * n) / size;
      const sample = samples[n] * window[n];
      re += sample * Math.cos(angle);
      im -= sample * Math.sin(angle);
    }
    const magnitude = Math.sqrt(re * re + im * im);
    bins.push({ re, im, magnitude, phase: Math.atan2(im, re) });
  }
  return bins;
}

export function spectralMeter(samples: Float32Array, sampleRate = 44100) {
  const bins = spectralAnalysis(samples, 1024);
  const nyquist = sampleRate / 2;
  const bandEnergy = { sub: 0, low: 0, mid: 0, presence: 0, air: 0 };
  bins.forEach((bin, index) => {
    const hz = (index / bins.length) * nyquist;
    if (hz < 80) bandEnergy.sub += bin.magnitude;
    else if (hz < 250) bandEnergy.low += bin.magnitude;
    else if (hz < 2000) bandEnergy.mid += bin.magnitude;
    else if (hz < 8000) bandEnergy.presence += bin.magnitude;
    else bandEnergy.air += bin.magnitude;
  });
  return bandEnergy;
}

export function phaseVocoderStretch(samples: Float32Array, ratio = 1, frameSize = 1024, hop = 256) {
  if (Math.abs(ratio - 1) < 0.01) return samples;
  const outputLength = Math.max(1, Math.floor(samples.length * ratio));
  const output = new Float32Array(outputLength + frameSize);
  const window = hannWindow(frameSize);
  for (let frameStart = 0; frameStart + frameSize < samples.length; frameStart += hop) {
    const outputStart = Math.floor(frameStart * ratio);
    for (let i = 0; i < frameSize && outputStart + i < output.length; i += 1) {
      const sourceIndex = frameStart + i;
      output[outputStart + i] += samples[sourceIndex] * window[i];
    }
  }
  return output.slice(0, outputLength);
}

export function detectPitchAutocorrelation(samples: Float32Array, sampleRate = 44100): PitchDetectionResult {
  let bestOffset = -1;
  let bestCorrelation = 0;
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length));
  if (rms < 0.01) return { frequency: 0, midi: 0, cents: 0, confidence: 0 };
  const minOffset = Math.floor(sampleRate / 900);
  const maxOffset = Math.floor(sampleRate / 55);
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < samples.length - offset; i += 1) correlation += samples[i] * samples[i + offset];
    correlation /= samples.length - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  const frequency = bestOffset > 0 ? sampleRate / bestOffset : 0;
  const midi = frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : 0;
  const roundedMidi = Math.round(midi);
  return { frequency, midi: roundedMidi, cents: (midi - roundedMidi) * 100, confidence: Math.min(1, bestCorrelation / Math.max(0.0001, rms)) };
}

export function pitchCorrectToScale(samples: Float32Array, sampleRate = 44100, scaleMidi: number[] = [0, 2, 3, 5, 7, 8, 10], strength = 0.35) {
  const pitch = detectPitchAutocorrelation(samples.slice(0, Math.min(samples.length, 4096)), sampleRate);
  if (!pitch.frequency || pitch.confidence < 0.08) return samples;
  const pitchClass = ((pitch.midi % 12) + 12) % 12;
  const targetClass = scaleMidi.reduce((best, note) => Math.abs(note - pitchClass) < Math.abs(best - pitchClass) ? note : best, scaleMidi[0]);
  const correctionSemitones = (((targetClass - pitchClass + 18) % 12) - 6) * strength;
  const ratio = Math.pow(2, correctionSemitones / 12);
  return phaseVocoderStretch(samples, 1 / ratio);
}

export function multibandCompress(samples: Float32Array) {
  const out = new Float32Array(samples.length);
  let low = 0;
  let mid = 0;
  for (let i = 0; i < samples.length; i += 1) {
    low += 0.025 * (samples[i] - low);
    mid += 0.09 * (samples[i] - mid);
    const lowBand = low;
    const midBand = mid - low;
    const highBand = samples[i] - mid;
    const compress = (x: number, threshold: number, ratio: number) => Math.sign(x) * (Math.abs(x) > threshold ? threshold + (Math.abs(x) - threshold) / ratio : Math.abs(x));
    out[i] = compress(lowBand, 0.46, 2.2) + compress(midBand, 0.34, 2.8) + compress(highBand, 0.22, 3.4);
  }
  return out;
}

export function automationValueAt(lane: AutomationLane, time: number) {
  const points = [...lane.points].sort((a, b) => a.time - b.time);
  if (!points.length) return 0;
  if (time <= points[0].time) return points[0].value;
  for (let i = 1; i < points.length; i += 1) {
    if (time <= points[i].time) {
      const previous = points[i - 1];
      const next = points[i];
      const t = (time - previous.time) / Math.max(0.0001, next.time - previous.time);
      return previous.value + (next.value - previous.value) * t;
    }
  }
  return points[points.length - 1].value;
}

export function renderAutomationFrames(lanes: AutomationLane[], duration: number, frameRate = 60): PluginAutomationFrame[] {
  const frames: PluginAutomationFrame[] = [];
  for (let frame = 0; frame <= duration * frameRate; frame += 1) {
    const time = frame / frameRate;
    frames.push({ time, values: Object.fromEntries(lanes.map((lane) => [lane.parameterId, automationValueAt(lane, time)])) });
  }
  return frames;
}

export type PluginDescriptor = {
  id: string;
  name: string;
  category: "instrument" | "effect" | "mastering" | "meter";
  parameters: Array<{ id: string; name: string; defaultValue: number; min: number; max: number }>;
};

export const EMS_PLUGIN_SDK_REGISTRY: PluginDescriptor[] = [
  { id: "ems-eq", name: "EMS Spectral EQ", category: "mastering", parameters: [{ id: "presence", name: "Presence", defaultValue: 0.5, min: 0, max: 1 }] },
  { id: "ems-compressor", name: "EMS Multiband Compressor", category: "mastering", parameters: [{ id: "glue", name: "Glue", defaultValue: 0.4, min: 0, max: 1 }] },
  { id: "ems-convolution", name: "EMS Convolution Space", category: "effect", parameters: [{ id: "space", name: "Space", defaultValue: 0.2, min: 0, max: 1 }] },
  { id: "ems-pitch", name: "EMS Pitch Correct", category: "effect", parameters: [{ id: "strength", name: "Strength", defaultValue: 0.35, min: 0, max: 1 }] },
];
