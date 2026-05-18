import type { StudioClip } from "./types";

export async function decodeStudioAudio(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("This browser cannot decode audio files.");
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const count = 1400;
    const block = Math.max(1, Math.floor(buffer.length / count));
    const peaks = Array.from({ length: count }, (_, i) => {
      let max = 0;
      const start = i * block;
      const end = Math.min(buffer.length, start + block);
      for (let s = start; s < end; s += 1) {
        let sample = 0;
        for (const channel of channels) sample += Math.abs(channel[s] ?? 0);
        max = Math.max(max, sample / channels.length);
      }
      return Number(max.toFixed(4));
    });
    return { duration: buffer.duration, peaks, sampleRate: buffer.sampleRate };
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
