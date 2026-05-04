import type { SubscriptionTier } from "@ems/db";

interface TierLimits {
  maxLicenses: number;
  maxSongs: number;
  canCreateVersus: boolean;
  canCreateLabel: boolean;
  canBoost: boolean;
  canAccessAnalytics: boolean;
  canAccessCity: boolean;
}

const UNLIMITED = 999_999;

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  FREE: {
    maxLicenses: 1,
    maxSongs: 1,
    canCreateVersus: false,
    canCreateLabel: false,
    canBoost: false,
    canAccessAnalytics: false,
    canAccessCity: false,
  },
  TRIAL: {
    // Same as PRO — full access during 7-day trial
    maxLicenses: 25,
    maxSongs: 10,
    canCreateVersus: true,
    canCreateLabel: false,
    canBoost: true,
    canAccessAnalytics: true,
    canAccessCity: true,
  },
  STARTER: {
    maxLicenses: 5,
    maxSongs: 3,
    canCreateVersus: false,
    canCreateLabel: false,
    canBoost: false,
    canAccessAnalytics: false,
    canAccessCity: false,
  },
  PRO: {
    maxLicenses: 25,
    maxSongs: 10,
    canCreateVersus: true,
    canCreateLabel: false,
    canBoost: true,
    canAccessAnalytics: true,
    canAccessCity: true,
  },
  PRIME: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: false,
    canBoost: true,
    canAccessAnalytics: true,
    canAccessCity: true,
  },
  TEAM: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: false,
    canBoost: true,
    canAccessAnalytics: true,
    canAccessCity: true,
  },
  LABEL_TIER: {
    maxLicenses: UNLIMITED,
    maxSongs: UNLIMITED,
    canCreateVersus: true,
    canCreateLabel: true,
    canBoost: true,
    canAccessAnalytics: true,
    canAccessCity: true,
  },
};

export function getTierLimits(tier: SubscriptionTier): TierLimits {
  return TIER_LIMITS[tier];
}

/** Returns the effective tier, treating an expired TRIAL as FREE. */
export function getActiveTier(user: {
  subscriptionTier: SubscriptionTier;
  trialExpiresAt?: Date | null;
}): SubscriptionTier {
  if (
    user.subscriptionTier === "TRIAL" &&
    user.trialExpiresAt &&
    user.trialExpiresAt < new Date()
  ) {
    return "FREE";
  }
  return user.subscriptionTier;
}

/** Returns tier limits respecting trial expiry. */
export function getActiveLimits(user: {
  subscriptionTier: SubscriptionTier;
  trialExpiresAt?: Date | null;
}): TierLimits {
  return TIER_LIMITS[getActiveTier(user)];
}
