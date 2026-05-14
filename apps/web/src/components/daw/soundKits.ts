import type { DrumKind, DrumKitId } from "./beatMachine";

export type SoundAssetType = DrumKind | "rim" | "melody" | "vocal";
export type SoundLicenseType = "owned" | "royalty_free" | "commercial_license" | "creator_uploaded" | "ai_generated" | "synth_fallback";
export type SoundUseLicense = "platform_demo" | "royalty_free" | "marketplace" | "exclusive";
export type SoundKitCategory = "trap" | "atl" | "memphis" | "detroit" | "rnb" | "drill" | "boom_bap" | "cinematic" | "premium";

export interface SoundLoudnessProfile { peakDb: number; lufs?: number; gainTrimDb?: number }
export interface SoundLicenseRecord { source: string; licenseType: SoundLicenseType; proofUrl?: string; allowedUse: string; restrictions?: string }
export interface SoundAsset {
  id: string; name: string; type: SoundAssetType; kitId: string; genreTags: SoundKitCategory[]; url: string | null; bpm?: number; key?: string; durationMs?: number; loudness: SoundLoudnessProfile; isPremium: boolean; licenseType: SoundUseLicense; license: SoundLicenseRecord; engineLane: DrumKind; fallbackKit: DrumKitId; createdAt: string;
}
export interface SoundKit { id: string; name: string; description: string; genreTags: SoundKitCategory[]; coverImageUrl?: string; isDefault: boolean; isPremium: boolean; sounds: SoundAsset[] }

export const SOUND_LOUDNESS_TARGETS: Record<SoundAssetType, SoundLoudnessProfile> = {
  kick: { peakDb: -1.5, gainTrimDb: 0 }, snare: { peakDb: -3, gainTrimDb: -1 }, clap: { peakDb: -3.5, gainTrimDb: -1 }, hat: { peakDb: -7, gainTrimDb: -3 }, openHat: { peakDb: -6, gainTrimDb: -2 }, perc: { peakDb: -6, gainTrimDb: -2 }, bass808: { peakDb: -2.5, gainTrimDb: -1 }, crash: { peakDb: -8, gainTrimDb: -4 }, rim: { peakDb: -5, gainTrimDb: -2 }, melody: { peakDb: -6, gainTrimDb: -3 }, vocal: { peakDb: -6, gainTrimDb: -3 },
};

const EMS_OWNED_GENERATED_LICENSE: SoundLicenseRecord = {
  source: "EMS procedural WAV generator",
  licenseType: "owned",
  allowedUse: "EMS-owned original generated audio for platform demo playback, beat-machine preview, waveform rendering, and commercial-safe in-platform starter sessions.",
  restrictions: "Do not resell as a standalone sample pack without EMS platform terms and licensing controls.",
};

function ownedSampleUrl(id: string): string { return `/api/samples/ems/${id}`; }

function sound(kitId: string, id: string, name: string, type: SoundAssetType, engineLane: DrumKind, genreTags: SoundKitCategory[], fallbackKit: DrumKitId, extra: Partial<Pick<SoundAsset, "url" | "bpm" | "key" | "durationMs" | "isPremium" | "licenseType" | "license">> = {}): SoundAsset {
  return { id, name, type, kitId, genreTags, url: extra.url ?? ownedSampleUrl(id), bpm: extra.bpm, key: extra.key, durationMs: extra.durationMs, loudness: SOUND_LOUDNESS_TARGETS[type], isPremium: extra.isPremium ?? false, licenseType: extra.licenseType ?? "platform_demo", license: extra.license ?? EMS_OWNED_GENERATED_LICENSE, engineLane, fallbackKit, createdAt: "2026-05-13T00:00:00.000Z" };
}

const EMS_STARTER_KIT_ID = "ems-starter-kit";
const pad = (n: number) => String(n).padStart(2, "0");

export const EMS_STARTER_KIT: SoundKit = {
  id: EMS_STARTER_KIT_ID,
  name: "EMS Starter Kit",
  description: "Launch-grade default beat machine kit with EMS-owned generated WAV assets, genre organization, license metadata, and fallback synthesis.",
  genreTags: ["trap", "atl", "drill", "memphis", "detroit", "rnb", "boom_bap", "cinematic"],
  isDefault: true,
  isPremium: false,
  sounds: [
    ...Array.from({ length: 8 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_kick_${pad(i + 1)}`, `EMS Kick ${i + 1}`, "kick", "kick", ["trap", "atl"], "trap", { durationMs: 380 })),
    ...Array.from({ length: 8 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_snare_${pad(i + 1)}`, `EMS Snare ${i + 1}`, "snare", "snare", ["trap", "drill"], "trap", { durationMs: 380 })),
    ...Array.from({ length: 8 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_clap_${pad(i + 1)}`, `EMS Clap ${i + 1}`, "clap", "clap", ["atl", "trap"], "trap", { durationMs: 380 })),
    ...Array.from({ length: 12 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_hat_closed_${pad(i + 1)}`, `EMS Closed Hat ${i + 1}`, "hat", "hat", ["trap", "drill", "detroit"], "trap", { durationMs: 380 })),
    ...Array.from({ length: 6 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_hat_open_${pad(i + 1)}`, `EMS Open Hat ${i + 1}`, "openHat", "openHat", ["trap", "atl"], "trap", { durationMs: 850 })),
    ...Array.from({ length: 10 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_808_${pad(i + 1)}`, `EMS 808 ${i + 1}`, "bass808", "bass808", ["trap", "drill", "memphis"], i % 3 === 0 ? "drill" : "trap", { key: i % 2 === 0 ? "F" : "G", durationMs: 1350 })),
    ...Array.from({ length: 12 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_perc_${pad(i + 1)}`, `EMS Perc ${i + 1}`, "perc", "perc", ["atl", "detroit", "rnb"], i % 2 === 0 ? "afro" : "trap", { durationMs: 380 })),
    ...Array.from({ length: 6 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_rim_${pad(i + 1)}`, `EMS Rim ${i + 1}`, "rim", "perc", ["rnb", "boom_bap"], "boomBap", { durationMs: 380 })),
    ...Array.from({ length: 8 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_fx_${pad(i + 1)}`, `EMS FX ${i + 1}`, "crash", "crash", ["cinematic", "trap"], "trap", { durationMs: 850 })),
    ...Array.from({ length: 4 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_melody_${pad(i + 1)}`, `EMS Melody One-Shot ${i + 1}`, "melody", "perc", ["rnb", "atl"], "afro", { key: i % 2 === 0 ? "C minor" : "F minor", durationMs: 750 })),
    ...Array.from({ length: 4 }, (_, i) => sound(EMS_STARTER_KIT_ID, `ems_vocal_${pad(i + 1)}`, `EMS Vocal Chop ${i + 1}`, "vocal", "clap", ["rnb", "atl"], "trap", { durationMs: 750 })),
  ],
};

export const GENRE_SOUND_KITS: SoundKit[] = [
  { id: "trap-essentials", name: "Trap Essentials", description: "Hard modern trap palette for default EMS production sessions.", genreTags: ["trap", "atl"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("trap")) },
  { id: "atl-nights", name: "ATL Nights", description: "Darker luxury Atlanta kit lane mapping for premium-feeling demos.", genreTags: ["atl", "trap", "rnb"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("atl")) },
  { id: "memphis-dark", name: "Memphis Dark", description: "Gritty 808 and dark percussion category manifest.", genreTags: ["memphis", "trap"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("memphis")) },
  { id: "detroit-street-bounce", name: "Detroit / Street Bounce", description: "Short, dry, fast-moving drums for street bounce patterns.", genreTags: ["detroit"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("detroit")) },
  { id: "rnb-soul", name: "R&B Soul", description: "Smooth rims, warm percussion, and softer one-shot mapping.", genreTags: ["rnb"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("rnb")) },
  { id: "drill-kit", name: "Drill Kit", description: "Sliding 808 and metallic percussion kit category manifest.", genreTags: ["drill"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("drill")) },
  { id: "boom-bap-vintage", name: "Boom Bap / Vintage", description: "Dusty rim, perc, and classic hip-hop kit category manifest.", genreTags: ["boom_bap"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("boom_bap")) },
  { id: "cinematic-fx", name: "Cinematic / FX", description: "Impact, crash, and transition-oriented sound category manifest.", genreTags: ["cinematic"], isDefault: false, isPremium: false, sounds: EMS_STARTER_KIT.sounds.filter((s) => s.genreTags.includes("cinematic")) },
];

export const SOUND_KITS: SoundKit[] = [EMS_STARTER_KIT, ...GENRE_SOUND_KITS];
export function getDefaultSoundKit(): SoundKit { return EMS_STARTER_KIT; }
export function getSoundKitById(kitId: string): SoundKit | undefined { return SOUND_KITS.find((kit) => kit.id === kitId); }
export function getSoundsForEngineLane(kit: SoundKit, lane: DrumKind): SoundAsset[] { return kit.sounds.filter((soundAsset) => soundAsset.engineLane === lane); }
export function getPlayableSoundUrl(soundAsset: SoundAsset): string | null { return soundAsset.url; }
export function requiresSampleBuffer(soundAsset: SoundAsset): boolean { return Boolean(soundAsset.url); }
