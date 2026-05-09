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
    // 5-song ceiling lets a new artist publish a mixtape without paying.
    // Anything above this falls into the upgrade path; redeem codes can
    // bump the effective limit further (see getActiveLimits → bonusSongSlots).
    maxSongs: 5,
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
  bonusSongSlots?: number | null;
}): TierLimits {
  const base = TIER_LIMITS[getActiveTier(user)];
  // Bonus slots from /redeem stack on top of the tier ceiling — but
  // never above the UNLIMITED sentinel, so we don't accidentally drop
  // a PRIME user's count down by adding to it.
  const bonus = Math.max(0, user.bonusSongSlots ?? 0);
  if (bonus === 0 || base.maxSongs >= UNLIMITED) return base;
  return { ...base, maxSongs: base.maxSongs + bonus };
}
