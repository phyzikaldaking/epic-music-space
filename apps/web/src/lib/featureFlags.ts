export type EmsFeatureFlag =
  | "studioCollabPresence"
  | "studioVideoRooms"
  | "studioRecovery"
  | "studioCommandPalette"
  | "marketplaceRecommendations"
  | "marketplaceModeration"
  | "liveRoomModeration"
  | "dmcaWorkflow"
  | "advancedAudioEngine"
  | "midiInput"
  | "stemExport"
  | "offlineRendering";

const DEFAULT_FLAGS: Record<EmsFeatureFlag, boolean> = {
  studioCollabPresence: true,
  studioVideoRooms: true,
  studioRecovery: true,
  studioCommandPalette: true,
  marketplaceRecommendations: false,
  marketplaceModeration: true,
  liveRoomModeration: true,
  dmcaWorkflow: true,
  advancedAudioEngine: false,
  midiInput: false,
  stemExport: false,
  offlineRendering: false,
};

function envName(flag: EmsFeatureFlag): string {
  return `NEXT_PUBLIC_EMS_${flag.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase()}`;
}

export function isFeatureEnabled(flag: EmsFeatureFlag): boolean {
  const raw = process.env[envName(flag)];
  if (raw === "1" || raw?.toLowerCase() === "true") return true;
  if (raw === "0" || raw?.toLowerCase() === "false") return false;
  return DEFAULT_FLAGS[flag];
}

export function getPublicFeatureFlags(): Record<EmsFeatureFlag, boolean> {
  return Object.keys(DEFAULT_FLAGS).reduce((acc, key) => {
    const flag = key as EmsFeatureFlag;
    acc[flag] = isFeatureEnabled(flag);
    return acc;
  }, {} as Record<EmsFeatureFlag, boolean>);
}
