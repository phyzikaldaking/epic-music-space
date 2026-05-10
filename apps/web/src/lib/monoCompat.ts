// Mono-compatibility check for stereo mixes. When inverse-correlated
// content lives on opposite channels (a too-wide synth, an out-of-phase
// mic) the L+R sum cancels and the track sounds gutted on phones,
// laptops, and Bluetooth speakers — anywhere the signal collapses to
// mono. We render the bounce twice: once stereo, once with the channels
// summed to a single mono buffer; then compare RMS energy. If the mono
// sum is more than 6 dB quieter, phase issues are present and we warn
// the user before they publish.

export interface MonoCompatReport {
  stereoRmsDb: number;
  monoRmsDb: number;
  /** monoRmsDb - stereoRmsDb. Negative = mono is quieter (phase issue). */
  deltaDb: number;
  /** True when delta is more negative than -6 dB. */
  hasPhaseIssue: boolean;
}

/** Decode a WAV/MP3 blob to an AudioBuffer using a transient
 *  OfflineAudioContext so we don't fight with the live engine for
 *  audio resources. */
async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) throw new Error("AudioContext unavailable");
  const ctx = new Ctor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

function rmsDb(samples: Float32Array): number {
  if (samples.length === 0) return -Infinity;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

export async function computeMonoCompat(blob: Blob): Promise<MonoCompatReport> {
  const audio = await decodeBlob(blob);
  if (audio.numberOfChannels < 2) {
    // Already mono — nothing to check, treat as perfectly compatible.
    const mono = audio.getChannelData(0);
    const db = rmsDb(mono);
    return { stereoRmsDb: db, monoRmsDb: db, deltaDb: 0, hasPhaseIssue: false };
  }
  const left = audio.getChannelData(0);
  const right = audio.getChannelData(1);
  const len = Math.min(left.length, right.length);
  // Stereo "RMS" — average across the two channels' instantaneous values
  // squared, matching how a meter reads the full stereo image.
  let stereoSum = 0;
  let monoSum = 0;
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    stereoSum += (l * l + r * r) * 0.5;
    // Sum-to-mono with 0.5 scale — same convention as our live
    // monoSumGain node so the numbers line up across the app.
    const m = (l + r) * 0.5;
    monoSum += m * m;
  }
  const stereoRms = Math.sqrt(stereoSum / len);
  const monoRms = Math.sqrt(monoSum / len);
  const stereoRmsDb = stereoRms > 0 ? 20 * Math.log10(stereoRms) : -Infinity;
  const monoRmsDb = monoRms > 0 ? 20 * Math.log10(monoRms) : -Infinity;
  const deltaDb =
    Number.isFinite(stereoRmsDb) && Number.isFinite(monoRmsDb)
      ? monoRmsDb - stereoRmsDb
      : 0;
  return {
    stereoRmsDb,
    monoRmsDb,
    deltaDb,
    hasPhaseIssue: deltaDb < -6,
  };
}
