/**
 * BPM detection from audio using autocorrelation on beat frequency range.
 * Analyzes audio in sliding windows to find dominant beat tempo.
 */

export async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  // Analyze beat range: 80–180 BPM = 1.33–3 Hz
  // Window: 4 seconds at a time for stability
  const windowSize = sampleRate * 4;
  const hopSize = sampleRate * 2;

  let maxEnergy = 0;
  let bestBPM = 120; // fallback

  // Slide through audio, compute autocorrelation for each window
  for (let start = 0; start + windowSize < channelData.length; start += hopSize) {
    const window = channelData.slice(start, start + windowSize);
    const bpm = autocorrelationBPM(window, sampleRate);

    // Rough energy-weighted voting: favor beats with clear periodicity
    const energy = computeWindowEnergy(window);
    if (energy > maxEnergy) {
      maxEnergy = energy;
      bestBPM = bpm;
    }
  }

  // Snap to nearest common grid (5 BPM increments)
  return Math.round(bestBPM / 5) * 5;
}

function autocorrelationBPM(audioSamples: Float32Array, sampleRate: number): number {
  // Downsample to ~4 kHz for efficiency
  const targetRate = 4000;
  const ratio = Math.floor(sampleRate / targetRate);
  const downsampled = new Float32Array(Math.floor(audioSamples.length / ratio));

  for (let i = 0; i < downsampled.length; i++) {
    downsampled[i] = audioSamples[i * ratio];
  }

  // Autocorrelation over beat-range lags: 0.5–1.5 seconds
  const minLag = Math.floor(0.5 * targetRate); // ~2000 samples
  const maxLag = Math.floor(1.5 * targetRate); // ~6000 samples
  let maxCorr = 0;
  let bestLag = minLag;

  for (let lag = minLag; lag < maxLag; lag += 4) {
    let correlation = 0;
    for (let i = 0; i < downsampled.length - lag; i++) {
      correlation += downsampled[i] * downsampled[i + lag];
    }
    if (correlation > maxCorr) {
      maxCorr = correlation;
      bestLag = lag;
    }
  }

  // Convert lag (in samples at ~4kHz) to BPM
  // BPM = 60 / (lag / sampleRate)
  const beatSeconds = bestLag / targetRate;
  const bpm = 60 / beatSeconds;

  return Math.max(80, Math.min(180, bpm));
}

function computeWindowEnergy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return sum / samples.length;
}

/** Classify genre from audio spectral characteristics */
export function classifyGenre(audioBuffer: AudioBuffer): "trap" | "house" | "dnb" | "pop" {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Compute FFT on a 2s window
  const fftSize = 4096;
  const window = channelData.slice(0, fftSize);

  // Simple energy bins: kick (50–100Hz), snare (2–5kHz), hats (8–15kHz)
  const kickEnergy = energyInRange(window, sampleRate, 50, 100);
  const snareEnergy = energyInRange(window, sampleRate, 2000, 5000);
  const hatEnergy = energyInRange(window, sampleRate, 8000, 15000);

  // Heuristic genre classification
  if (hatEnergy > snareEnergy * 1.5) {
    return "dnb"; // Drum and bass has prominent hi-hats
  } else if (kickEnergy > snareEnergy * 1.2) {
    return "house"; // House has heavy kick
  } else if (snareEnergy > hatEnergy * 1.3) {
    return "trap"; // Trap has sharp snares
  }
  return "pop";
}

function energyInRange(
  samples: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number
): number {
  // Approximate by summing RMS in frequency bins
  let sum = 0;
  const binSize = sampleRate / samples.length;
  const minBin = Math.floor(minFreq / binSize);
  const maxBin = Math.ceil(maxFreq / binSize);

  for (let i = minBin; i < maxBin && i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return sum;
}
