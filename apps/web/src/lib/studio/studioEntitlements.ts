export type StudioPublicPlan = "free" | "creator" | "pro" | "studio";
export type StudioBillingTier = "FREE" | "TRIAL" | "STARTER" | "PRO" | "PRIME" | "TEAM" | "LABEL_TIER";
export type StudioExportFormat = "mp3" | "m4a" | "wav" | "flac" | "midi" | "zip_stems";
export type StudioStemExportLevel = "none" | "limited" | "full";
export type StudioCollaborationLevel = "share-link" | "review-link" | "project-invites" | "team-workspace";
export type StudioRecordingAccess = "trial" | "basic" | "full";
export type StudioCommercialUse = "limited" | "included";

export type StudioEntitlement = {
  plan: StudioPublicPlan;
  billingTier: StudioBillingTier;
  label: string;
  monthlyUsd: number | null;
  aiCreditsMonthly: number;
  maxProjects: number;
  maxCollaboratorsPerProject: number;
  storageGb: number;
  maxUploadMb: number;
  maxRecordingMinutesPerProject: number;
  recording: StudioRecordingAccess;
  recordingTrialDays: number;
  commercialUse: StudioCommercialUse;
  exportFormats: StudioExportFormat[];
  maxExportSampleRate: 44100 | 48000;
  maxExportBitDepth: 16 | 24;
  stemExport: StudioStemExportLevel;
  collaboration: StudioCollaborationLevel;
  priorityGeneration: boolean;
  watermark: boolean;
};

export const STUDIO_ENTITLEMENTS: Record<StudioPublicPlan, StudioEntitlement> = {
  free: {
    plan: "free",
    billingTier: "FREE",
    label: "Free",
    monthlyUsd: 0,
    aiCreditsMonthly: 25,
    maxProjects: 3,
    maxCollaboratorsPerProject: 0,
    storageGb: 1,
    maxUploadMb: 100,
    maxRecordingMinutesPerProject: 10,
    recording: "trial",
    recordingTrialDays: 30,
    commercialUse: "limited",
    exportFormats: ["mp3", "m4a"],
    maxExportSampleRate: 44100,
    maxExportBitDepth: 16,
    stemExport: "none",
    collaboration: "share-link",
    priorityGeneration: false,
    watermark: true,
  },
  creator: {
    plan: "creator",
    billingTier: "STARTER",
    label: "Creator",
    monthlyUsd: 15,
    aiCreditsMonthly: 250,
    maxProjects: 25,
    maxCollaboratorsPerProject: 1,
    storageGb: 25,
    maxUploadMb: 500,
    maxRecordingMinutesPerProject: 120,
    recording: "basic",
    recordingTrialDays: 0,
    commercialUse: "included",
    exportFormats: ["mp3", "m4a", "wav", "flac", "midi"],
    maxExportSampleRate: 48000,
    maxExportBitDepth: 24,
    stemExport: "limited",
    collaboration: "review-link",
    priorityGeneration: false,
    watermark: false,
  },
  pro: {
    plan: "pro",
    billingTier: "PRO",
    label: "Pro",
    monthlyUsd: 35,
    aiCreditsMonthly: 900,
    maxProjects: 100,
    maxCollaboratorsPerProject: 5,
    storageGb: 100,
    maxUploadMb: 2048,
    maxRecordingMinutesPerProject: 600,
    recording: "full",
    recordingTrialDays: 0,
    commercialUse: "included",
    exportFormats: ["mp3", "m4a", "wav", "flac", "midi", "zip_stems"],
    maxExportSampleRate: 48000,
    maxExportBitDepth: 24,
    stemExport: "full",
    collaboration: "project-invites",
    priorityGeneration: true,
    watermark: false,
  },
  studio: {
    plan: "studio",
    billingTier: "TEAM",
    label: "Studio",
    monthlyUsd: 99,
    aiCreditsMonthly: 3000,
    maxProjects: 500,
    maxCollaboratorsPerProject: 25,
    storageGb: 500,
    maxUploadMb: 5120,
    maxRecordingMinutesPerProject: 3000,
    recording: "full",
    recordingTrialDays: 0,
    commercialUse: "included",
    exportFormats: ["mp3", "m4a", "wav", "flac", "midi", "zip_stems"],
    maxExportSampleRate: 48000,
    maxExportBitDepth: 24,
    stemExport: "full",
    collaboration: "team-workspace",
    priorityGeneration: true,
    watermark: false,
  },
};

export function planFromBillingTier(tier?: string | null): StudioPublicPlan {
  if (tier === "TEAM" || tier === "LABEL_TIER") return "studio";
  if (tier === "PRO" || tier === "PRIME") return "pro";
  if (tier === "STARTER" || tier === "TRIAL") return "creator";
  return "free";
}

export function entitlementForBillingTier(tier?: string | null) {
  return STUDIO_ENTITLEMENTS[planFromBillingTier(tier)];
}

export function hasExportFormat(entitlement: StudioEntitlement, format: StudioExportFormat) {
  return entitlement.exportFormats.includes(format);
}

export function hasCommercialUse(entitlement: StudioEntitlement) {
  return entitlement.commercialUse === "included";
}

export function canRecord(entitlement: StudioEntitlement, trialActive: boolean) {
  return entitlement.recording === "basic" || entitlement.recording === "full" || trialActive;
}

export function canExportStems(entitlement: StudioEntitlement) {
  return entitlement.stemExport === "limited" || entitlement.stemExport === "full";
}

export function canInviteCollaborators(entitlement: StudioEntitlement) {
  return entitlement.collaboration === "project-invites" || entitlement.collaboration === "team-workspace";
}

export function canUseTeamWorkspace(entitlement: StudioEntitlement) {
  return entitlement.collaboration === "team-workspace";
}
