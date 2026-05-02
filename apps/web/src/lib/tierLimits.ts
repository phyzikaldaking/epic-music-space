import type { SubscriptionTier } from "@ems/db";

interface TierLimits {
  maxLicenses: number;
  maxSongs: number;
  canCreateVersus: boolean;
  canCreateLabel: boolean;
}

const UNLIMITED = 999_999;

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxLicenses: 1,
    maxSongs: 0,
    canCreateVersus: false,
    canCreateLabel: false,
  },
  STARTER: {
    maxLicenses: 5,
    maxSongs: 0,
    canCreateVersus: false,
    canCreateLabel: false,
  },
  PRO: {
    maxLicenses: 25,
    maxSongs: 10,
    canCreateVersus: true,
    canCreateLabel: false,
  },
  PRIME: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: false,
  },
  TEAM: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: false,
  },
  LABEL_TIER: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: true,
  },
};

export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_LIMITS[tier];
}
