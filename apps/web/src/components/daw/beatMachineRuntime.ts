import { scheduleDrumHit, type BeatLaneEqSetting, type DrumKind, type DrumKitId } from "./beatMachine";
import { getDefaultSoundKit, getSoundKitById, getSoundsForEngineLane, type SoundAsset, type SoundKit } from "./soundKits";
import { loadSoundAssetBuffer } from "./sampleLoader";

export interface BeatMachineRuntimeHitOptions {
  when: number;
  velocity?: number;
  pitchSemis?: number;
  laneEq?: BeatLaneEqSetting;
  kitId?: string;
  soundId?: string;
}

export interface BeatMachineRuntimePreviewOptions {
  velocity?: number;
  pitchSemis?: number;
  laneEq?: BeatLaneEqSetting;
}

function resolveSoundKit(kitId?: string): SoundKit {
  return (kitId ? getSoundKitById(kitId) : undefined) ?? getDefaultSoundKit();
}

export function resolveRuntimeSound(lane: DrumKind, kitId?: string, soundId?: string): SoundAsset | null {
  const kit = resolveSoundKit(kitId);
  const laneSounds = getSoundsForEngineLane(kit, lane);
  if (soundId) return laneSounds.find((sound) => sound.id === soundId) ?? null;
  return laneSounds[0] ?? null;
}

export async function scheduleSoundKitHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  lane: DrumKind,
  options: BeatMachineRuntimeHitOptions,
): Promise<SoundAsset | null> {
  const sound = resolveRuntimeSound(lane, options.kitId, options.soundId);
  // Product mode is sample-first: never silently synthesize a replacement sound.
  // A missing asset is reported to the caller so the UI can show a recoverable error.
  if (!sound?.url) return null;
  let sampleBuffer: AudioBuffer;
  try {
    sampleBuffer = await loadSoundAssetBuffer(ctx, sound);
  } catch {
    return null;
  }
  scheduleDrumHit(ctx, dest, lane, {
    when: options.when,
    velocity: options.velocity,
    pitchSemis: options.pitchSemis,
    laneEq: options.laneEq,
    kit: sound.fallbackKit,
    sampleBuffer,
  });
  return sound;
}

export async function previewSoundAsset(
  ctx: AudioContext,
  dest: AudioNode,
  sound: SoundAsset,
  options: BeatMachineRuntimePreviewOptions = {},
): Promise<void> {
  const sampleBuffer = await loadSoundAssetBuffer(ctx, sound);

  scheduleDrumHit(ctx, dest, sound.engineLane, {
    when: ctx.currentTime + 0.01,
    velocity: options.velocity ?? 1,
    pitchSemis: options.pitchSemis,
    laneEq: options.laneEq,
    kit: sound.fallbackKit,
    sampleBuffer,
  });
}

export async function preloadSoundKit(ctx: BaseAudioContext, kitId?: string): Promise<SoundAsset[]> {
  const kit = resolveSoundKit(kitId);
  const soundsWithUrls = kit.sounds.filter((sound) => Boolean(sound.url));
  await Promise.all(soundsWithUrls.map((sound) => loadSoundAssetBuffer(ctx, sound)));
  return soundsWithUrls;
}
