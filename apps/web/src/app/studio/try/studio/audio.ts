import type { StudioClip } from "./types";

export type StudioWaveformPeaks = {
  version: 2;
  channels: number[][];
  mono: number[];
  resolution: number;
  normalizedAt: string;
};

export function normalizePeakArray(peaks: number[]) {
  const max = Math.max(0.0001, ...peaks.map((peak) => Math.abs(peak)));
  return peaks.map((peak) => Number(Math.min(1, Math.abs(peak) / max).toFixed(4)));
}

export function normalizeWaveformPeaks(channels: number[][], resolution: number): StudioWaveformPeaks {
  const normalizedChannels = channels.map(normalizePeakArray);
  const longest = Math.max(0, ...normalizedChannels.map((channel) => channel.length));
  const mono = Array.from({ length: longest }, (_, index) => {
    const sum = normalizedChannels.reduce((total, channel) => total + (channel[index] ?? 0), 0);
    return Number((sum / Math.max(1, normalizedChannels.length)).toFixed(4));
  });

  return {
    version: 2,
    channels: normalizedChannels,
    mono: normalizePeakArray(mono),
    resolution,
    normalizedAt: new Date().toISOString(),
  };
}

export function downsamplePeaks(peaks: number[], targetLength: number) {
  if (targetLength <= 0 || peaks.length <= targetLength) return peaks;
  const block = peaks.length / targetLength;
  return Array.from({ length: targetLength }, (_, index) => {
    const start = Math.floor(index * block);
    const end = Math.min(peaks.length, Math.ceil((index + 1) * block));
    let max = 0;
    for (let cursor = start; cursor < end; cursor += 1) max = Math.max(max, peaks[cursor] ?? 0);
    return Number(max.toFixed(4));
  });
}

export function waveformCacheKey(clip: Pick<StudioClip, "id" | "duration" | "size" | "peaks">, zoom = 1) {
  return `${clip.id}:${clip.duration}:${clip.size}:${clip.peaks.length}:${Math.round(zoom)}`;
}

export async function decodeStudioAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const count = 1400;
    const block = Math.max(1, Math.floor(buffer.length / count));
    const channelPeaks = Array.from({ length: buffer.numberOfChannels }, (_, channelIndex) => {
      const data = buffer.getChannelData(channelIndex);
      return Array.from({ length: count }, (_, i) => {
        let max = 0;
        const start = i * block;
        const end = Math.min(buffer.length, start + block);
        for (let s = start; s < end; s += 1) max = Math.max(max, Math.abs(data[s] ?? 0));
        return Number(max.toFixed(4));
      });
    });
    const waveform = normalizeWaveformPeaks(channelPeaks, count);
    return { duration: buffer.duration, peaks: waveform.mono, waveform, sampleRate: buffer.sampleRate };
  } finally {
    await ctx.close();
  }
}

export function clipFileExtension(clip: StudioClip) {
  const ext = clip.name.split(".").pop();
  if (ext && ext.length <= 5) return ext.toLowerCase();
  if (clip.type.includes("wav")) return "wav";
  if (clip.type.includes("mpeg")) return "mp3";
  if (clip.type.includes("webm")) return "webm";
  return "audio";
}

export function isTemporaryObjectUrl(url: string) {
  return url.startsWith("blob:");
}

export function revokeTemporaryClipUrls(clips: StudioClip[]) {
  clips.forEach((clip) => {
    if (clip.url && isTemporaryObjectUrl(clip.url)) URL.revokeObjectURL(clip.url);
  });
}
