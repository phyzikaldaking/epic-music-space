export type StudioPublicPlan = "free" | "creator" | "pro" | "studio";

export type StudioEntitlement = {
  plan: StudioPublicPlan;
  billingTier: "FREE" | "STARTER" | "PRO" | "TEAM";
  label: string;
  monthlyUsd: number | null;
  aiCreditsMonthly: number;
  maxProjects: number;
  storageGb: number;
  recording: "trial" | "basic" | "full";
  recordingTrialDays: number;
  commercialUse: "limited" | "included";
  mp3Export: boolean;
  wavExport: boolean;
  flacExport: boolean;
  m4aExport: boolean;
  midiImportExport: boolean;
  stemExport: "none" | "limited" | "full";
  collaboration: "share-link" | "review-link" | "project-invites" | "team-workspace";
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
    storageGb: 1,
    recording: "trial",
    recordingTrialDays: 30,
    commercialUse: "limited",
    mp3Export: true,
    wavExport: false,
    flacExport: false,
    m4aExport: true,
    midiImportExport: false,
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
    storageGb: 25,
    recording: "basic",
    recordingTrialDays: 0,
    commercialUse: "included",
    mp3Export: true,
    wavExport: true,
    flacExport: true,
    m4aExport: true,
    midiImportExport: true,
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
    storageGb: 100,
    recording: "full",
    recordingTrialDays: 0,
    commercialUse: "included",
    mp3Export: true,
    wavExport: true,
    flacExport: true,
    m4aExport: true,
    midiImportExport: true,
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
    storageGb: 500,
    recording: "full",
    recordingTrialDays: 0,
    commercialUse: "included",
    mp3Export: true,
    wavExport: true,
    flacExport: true,
    m4aExport: true,
    midiImportExport: true,
    stemExport: "full",
    collaboration: "team-workspace",
    priorityGeneration: true,
    watermark: false,
  },
};

export const STUDIO_AI_CREDIT_COSTS = {
  beatGeneration: 10,
  stemGeneration: 20,
  vocalEnhancement: 12,
  arrangementSuggestion: 6,
  highQualityRender: 8,
  stemSeparation: 30,
  masteringPreview: 15,
} as const;

export function canRecord(entitlement: StudioEntitlement, trialActive: boolean) {
  return entitlement.recording === "basic" || entitlement.recording === "full" || trialActive;
}

export function canExportStems(entitlement: StudioEntitlement) {
  return entitlement.stemExport === "limited" || entitlement.stemExport === "full";
}

export function canCollaborate(entitlement: StudioEntitlement) {
  return entitlement.collaboration === "project-invites" || entitlement.collaboration === "team-workspace";
}

export function planFromBillingTier(tier?: string | null): StudioPublicPlan {
  if (tier === "TEAM" || tier === "LABEL_TIER") return "studio";
  if (tier === "PRO" || tier === "PRIME") return "pro";
  if (tier === "STARTER" || tier === "TRIAL") return "creator";
  return "free";
}
