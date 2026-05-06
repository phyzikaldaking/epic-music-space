import { describe, it, expect } from "vitest";
import {
  TIER_LIMITS,
  getTierLimits,
  getActiveTier,
  getActiveLimits,
} from "@/lib/tierLimits";

// ---------------------------------------------------------------------------
// TIER_LIMITS — completeness
// ---------------------------------------------------------------------------

describe("TIER_LIMITS", () => {
  const allTiers = [
    "FREE",
    "TRIAL",
    "STARTER",
    "PRO",
    "PRIME",
    "TEAM",
    "LABEL_TIER",
  ] as const;

  it("contains an entry for every subscription tier", () => {
    for (const tier of allTiers) {
      expect(TIER_LIMITS).toHaveProperty(tier);
    }
  });

  it("each tier limit entry has all required fields", () => {
    for (const tier of allTiers) {
      const limits = TIER_LIMITS[tier];
      expect(typeof limits.maxLicenses).toBe("number");
      expect(typeof limits.maxSongs).toBe("number");
      expect(typeof limits.canCreateVersus).toBe("boolean");
      expect(typeof limits.canCreateLabel).toBe("boolean");
      expect(typeof limits.canBoost).toBe("boolean");
      expect(typeof limits.canAccessAnalytics).toBe("boolean");
      expect(typeof limits.canAccessCity).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// Tier limits — individual tier assertions
// ---------------------------------------------------------------------------

describe("FREE tier limits", () => {
  it("allows only 1 license and 1 song", () => {
    const { maxLicenses, maxSongs } = TIER_LIMITS.FREE;
    expect(maxLicenses).toBe(1);
    expect(maxSongs).toBe(1);
  });

  it("disables all premium features", () => {
    const limits = TIER_LIMITS.FREE;
    expect(limits.canCreateVersus).toBe(false);
    expect(limits.canCreateLabel).toBe(false);
    expect(limits.canBoost).toBe(false);
    expect(limits.canAccessAnalytics).toBe(false);
    expect(limits.canAccessCity).toBe(false);
  });
});

describe("STARTER tier limits", () => {
  it("allows 5 licenses and 3 songs", () => {
    const { maxLicenses, maxSongs } = TIER_LIMITS.STARTER;
    expect(maxLicenses).toBe(5);
    expect(maxSongs).toBe(3);
  });

  it("does not enable versus, label, boost, analytics, or city", () => {
    const limits = TIER_LIMITS.STARTER;
    expect(limits.canCreateVersus).toBe(false);
    expect(limits.canCreateLabel).toBe(false);
    expect(limits.canBoost).toBe(false);
    expect(limits.canAccessAnalytics).toBe(false);
    expect(limits.canAccessCity).toBe(false);
  });
});

describe("PRO tier limits", () => {
  it("allows 25 licenses and 10 songs", () => {
    const { maxLicenses, maxSongs } = TIER_LIMITS.PRO;
    expect(maxLicenses).toBe(25);
    expect(maxSongs).toBe(10);
  });

  it("enables versus, boost, analytics, and city but not label", () => {
    const limits = TIER_LIMITS.PRO;
    expect(limits.canCreateVersus).toBe(true);
    expect(limits.canBoost).toBe(true);
    expect(limits.canAccessAnalytics).toBe(true);
    expect(limits.canAccessCity).toBe(true);
    expect(limits.canCreateLabel).toBe(false);
  });
});

describe("PRIME and TEAM tier limits", () => {
  it("PRIME has unlimited licenses and songs", () => {
    const limits = TIER_LIMITS.PRIME;
    expect(limits.maxLicenses).toBeGreaterThan(10_000);
    expect(limits.maxSongs).toBeGreaterThan(10_000);
  });

  it("TEAM has unlimited licenses and songs", () => {
    const limits = TIER_LIMITS.TEAM;
    expect(limits.maxLicenses).toBeGreaterThan(10_000);
    expect(limits.maxSongs).toBeGreaterThan(10_000);
  });

  it("both PRIME and TEAM enable all premium features except label creation", () => {
    for (const tier of ["PRIME", "TEAM"] as const) {
      const limits = TIER_LIMITS[tier];
      expect(limits.canCreateVersus).toBe(true);
      expect(limits.canBoost).toBe(true);
      expect(limits.canAccessAnalytics).toBe(true);
      expect(limits.canAccessCity).toBe(true);
      expect(limits.canCreateLabel).toBe(false);
    }
  });
});

describe("LABEL_TIER limits", () => {
  it("has unlimited licenses and songs", () => {
    const limits = TIER_LIMITS.LABEL_TIER;
    expect(limits.maxLicenses).toBeGreaterThan(10_000);
    expect(limits.maxSongs).toBeGreaterThan(10_000);
  });

  it("is the only tier that enables label creation", () => {
    expect(TIER_LIMITS.LABEL_TIER.canCreateLabel).toBe(true);
    for (const tier of ["FREE", "TRIAL", "STARTER", "PRO", "PRIME", "TEAM"] as const) {
      expect(TIER_LIMITS[tier].canCreateLabel).toBe(false);
    }
  });

  it("enables all other premium features", () => {
    const limits = TIER_LIMITS.LABEL_TIER;
    expect(limits.canCreateVersus).toBe(true);
    expect(limits.canBoost).toBe(true);
    expect(limits.canAccessAnalytics).toBe(true);
    expect(limits.canAccessCity).toBe(true);
  });
});

describe("TRIAL tier limits", () => {
  it("matches PRO limits (full access during trial)", () => {
    const trial = TIER_LIMITS.TRIAL;
    const pro = TIER_LIMITS.PRO;
    expect(trial.maxLicenses).toBe(pro.maxLicenses);
    expect(trial.maxSongs).toBe(pro.maxSongs);
    expect(trial.canCreateVersus).toBe(pro.canCreateVersus);
    expect(trial.canBoost).toBe(pro.canBoost);
    expect(trial.canAccessAnalytics).toBe(pro.canAccessAnalytics);
    expect(trial.canAccessCity).toBe(pro.canAccessCity);
  });
});

// ---------------------------------------------------------------------------
// getTierLimits
// ---------------------------------------------------------------------------

describe("getTierLimits", () => {
  it("returns the correct limits object for the given tier", () => {
    expect(getTierLimits("FREE")).toEqual(TIER_LIMITS.FREE);
    expect(getTierLimits("PRO")).toEqual(TIER_LIMITS.PRO);
    expect(getTierLimits("LABEL_TIER")).toEqual(TIER_LIMITS.LABEL_TIER);
  });
});

// ---------------------------------------------------------------------------
// getActiveTier
// ---------------------------------------------------------------------------

describe("getActiveTier", () => {
  it("returns the tier as-is when it is not TRIAL", () => {
    expect(getActiveTier({ subscriptionTier: "PRO" })).toBe("PRO");
    expect(getActiveTier({ subscriptionTier: "FREE" })).toBe("FREE");
    expect(getActiveTier({ subscriptionTier: "PRIME" })).toBe("PRIME");
    expect(getActiveTier({ subscriptionTier: "LABEL_TIER" })).toBe("LABEL_TIER");
  });

  it("returns TRIAL when trial has not expired yet", () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
    const result = getActiveTier({
      subscriptionTier: "TRIAL",
      trialExpiresAt: futureDate,
    });
    expect(result).toBe("TRIAL");
  });

  it("returns FREE when TRIAL has expired", () => {
    const pastDate = new Date(Date.now() - 1); // 1 ms in the past
    const result = getActiveTier({
      subscriptionTier: "TRIAL",
      trialExpiresAt: pastDate,
    });
    expect(result).toBe("FREE");
  });

  it("returns TRIAL when trialExpiresAt is null (no expiry set)", () => {
    const result = getActiveTier({
      subscriptionTier: "TRIAL",
      trialExpiresAt: null,
    });
    expect(result).toBe("TRIAL");
  });

  it("returns TRIAL when trialExpiresAt is undefined", () => {
    const result = getActiveTier({ subscriptionTier: "TRIAL" });
    expect(result).toBe("TRIAL");
  });
});

// ---------------------------------------------------------------------------
// getActiveLimits
// ---------------------------------------------------------------------------

describe("getActiveLimits", () => {
  it("returns PRO limits for an active (non-expired) TRIAL", () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const limits = getActiveLimits({
      subscriptionTier: "TRIAL",
      trialExpiresAt: futureDate,
    });
    expect(limits).toEqual(TIER_LIMITS.TRIAL);
  });

  it("returns FREE limits for an expired TRIAL", () => {
    const pastDate = new Date(Date.now() - 1000);
    const limits = getActiveLimits({
      subscriptionTier: "TRIAL",
      trialExpiresAt: pastDate,
    });
    expect(limits).toEqual(TIER_LIMITS.FREE);
  });

  it("returns the tier's own limits for non-TRIAL tiers", () => {
    const limits = getActiveLimits({ subscriptionTier: "PRO" });
    expect(limits).toEqual(TIER_LIMITS.PRO);
  });
});
