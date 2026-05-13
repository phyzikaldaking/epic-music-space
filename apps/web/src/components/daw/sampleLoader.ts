import type { SoundAsset } from "./soundKits";

const sampleCache = new Map<string, Promise<AudioBuffer | null>>();

export async function loadSoundAssetBuffer(ctx: BaseAudioContext, soundAsset: SoundAsset): Promise<AudioBuffer | null> {
  if (!soundAsset.url) return null;

  const cacheKey = `${soundAsset.id}:${soundAsset.url}`;
  const existing = sampleCache.get(cacheKey);
  if (existing) return existing;

  const pending = fetch(soundAsset.url)
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load sound asset ${soundAsset.id}: ${response.status}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer.slice(0)))
    .catch((error) => {
      console.warn("EMS sample loader falling back to synth voice", { soundId: soundAsset.id, url: soundAsset.url, error });
      return null;
    });

  sampleCache.set(cacheKey, pending);
  return pending;
}

export function clearSoundAssetCache(): void {
  sampleCache.clear();
}

export function getCachedSoundAssetCount(): number {
  return sampleCache.size;
}

export function computeWaveformPeaks(buffer: AudioBuffer, bucketCount = 64): number[] {
  const channel = buffer.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(channel.length / bucketCount));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(channel.length, start + bucketSize);
    let peak = 0;

    for (let i = start; i < end; i += 1) {
      peak = Math.max(peak, Math.abs(channel[i] ?? 0));
    }

    peaks.push(Number(peak.toFixed(4)));
  }

  return peaks;
}

export async function loadWaveformPreview(ctx: BaseAudioContext, soundAsset: SoundAsset, bucketCount = 64): Promise<number[] | null> {
  const buffer = await loadSoundAssetBuffer(ctx, soundAsset);
  if (!buffer) return null;
  return computeWaveformPeaks(buffer, bucketCount);
}
