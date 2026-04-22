import { describe, it, expect, beforeEach, vi } from "vitest";
import { calculateAiScore, scoreToDistrict, DISTRICT_META } from "./scoring";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

/** Build a minimal valid ScoreInputs object (all zeros / neutral) */
function makeInputs(
  overrides: Partial<Parameters<typeof calculateAiScore>[0]> = {}
): Parameters<typeof calculateAiScore>[0] {
  return {
    soldLicenses: 0,
    totalLicenses: 0,
    streamCount: 0,
    versusWins: 0,
    versusLosses: 0,
    aiSentiment: 0,
    boostScore: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// calculateAiScore
// ─────────────────────────────────────────────────────────

describe("calculateAiScore", () => {
  beforeEach(() => {
    // Pin the clock so recency is deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  it("returns 0 for a brand-new song with no activity and no total licenses (only recency)", () => {
    // totalLicenses = 0 → salesPct = 0; createdAt = now → recency = 100 → 100 * 0.10 = 10
    const score = calculateAiScore(
      makeInputs({ createdAt: new Date("2025-01-01T00:00:00.000Z") })
    );
    expect(score).toBe(10);
  });

  it("returns 100 for a maximally-performing song created right now", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 100,
        totalLicenses: 100,
        streamCount: 10_000,
        versusWins: 50,
        versusLosses: 0,
        aiSentiment: 1,
        boostScore: 100,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // All components at maximum → 30 + 20 + 15 + 10 + 10 + 15 = 100
    expect(score).toBe(100);
  });

  it("calculates a mid-range score correctly", () => {
    // All components at 50% except recency (100% since createdAt = now)
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 50,
        totalLicenses: 100,
        streamCount: 5_000,
        versusWins: 5,
        versusLosses: 5,
        aiSentiment: 0.5,
        boostScore: 50,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // salesPct=50, engagement=50, versusScore=50, sentiment=50, recency=100, boost=50
    // 50*0.30 + 50*0.20 + 50*0.15 + 50*0.10 + 100*0.10 + 50*0.15
    // = 15 + 10 + 7.5 + 5 + 10 + 7.5 = 55
    expect(score).toBe(55);
  });

  it("computes zero recency for a song that is exactly 365 days old", () => {
    const createdAt = new Date("2025-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z")); // 365 days later

    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 100,
        totalLicenses: 100,
        streamCount: 10_000,
        versusWins: 50,
        versusLosses: 0,
        aiSentiment: 1,
        boostScore: 100,
        createdAt,
      })
    );
    // recency = max(0, 100 - (365/365)*100) = 0
    // score = 30 + 20 + 15 + 10 + 0 + 15 = 90
    expect(score).toBe(90);
  });

  it("clamps the final score to 100 (never exceeds ceiling)", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 100,
        totalLicenses: 100,
        streamCount: 100_000, // far above soft cap → capped at 100
        versusWins: 200,
        versusLosses: 0,
        aiSentiment: 1,
        boostScore: 100,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("clamps the final score to 0 (never goes negative)", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 0,
        totalLicenses: 100,
        streamCount: 0,
        versusWins: 0,
        versusLosses: 0,
        aiSentiment: 0,
        boostScore: 0,
        // Far in the past: recency → 0
        createdAt: new Date("2000-01-01T00:00:00.000Z"),
      })
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("treats a sold-out song correctly (salesPct = 100)", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 1_000,
        totalLicenses: 1_000,
        streamCount: 0,
        versusWins: 0,
        versusLosses: 0,
        aiSentiment: 0,
        boostScore: 0,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // salesPct=100, engagement=0, versus=0, sentiment=0, recency=100, boost=0
    // 100*0.30 + 0 + 0 + 0 + 100*0.10 + 0 = 30 + 10 = 40
    expect(score).toBe(40);
  });

  it("handles a song with no versus history (versusScore = 0)", () => {
    const score = calculateAiScore(
      makeInputs({
        versusWins: 0,
        versusLosses: 0,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // Only recency contributes: 100 * 0.10 = 10
    expect(score).toBe(10);
  });

  it("caps engagement at 100 for streams well above the soft max", () => {
    const score = calculateAiScore(
      makeInputs({
        streamCount: 1_000_000, // way above 10,000 soft cap
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // engagement capped at 100 → 100 * 0.20 = 20, plus recency 10 = 30
    expect(score).toBe(30);
  });

  it("caps boostScore to 100 regardless of raw input", () => {
    const over = calculateAiScore(
      makeInputs({
        boostScore: 200,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    const capped = calculateAiScore(
      makeInputs({
        boostScore: 100,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    expect(over).toBe(capped);
  });

  it("returns a number rounded to one decimal place", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 1,
        totalLicenses: 3, // salesPct ≈ 33.33...
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      })
    );
    // Verify it is a finite number with at most one decimal place
    expect(typeof score).toBe("number");
    expect(Number.isFinite(score)).toBe(true);
    expect(Math.round(score * 10)).toBe(score * 10);
  });
});

// ─────────────────────────────────────────────────────────
// scoreToDistrict
// ─────────────────────────────────────────────────────────

describe("scoreToDistrict", () => {
  it("returns LABEL_ROW for a score of exactly 80", () => {
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
  });

  it("returns LABEL_ROW for a score above 80", () => {
    expect(scoreToDistrict(95)).toBe("LABEL_ROW");
    expect(scoreToDistrict(100)).toBe("LABEL_ROW");
  });

  it("returns DOWNTOWN_PRIME for a score of exactly 50", () => {
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
  });

  it("returns DOWNTOWN_PRIME for a score between 50 and 79.9", () => {
    expect(scoreToDistrict(65)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79.9)).toBe("DOWNTOWN_PRIME");
  });

  it("returns INDIE_BLOCKS for a score below 50", () => {
    expect(scoreToDistrict(0)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(49.9)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(25)).toBe("INDIE_BLOCKS");
  });
});

// ─────────────────────────────────────────────────────────
// DISTRICT_META
// ─────────────────────────────────────────────────────────

describe("DISTRICT_META", () => {
  it("contains metadata for all three districts", () => {
    expect(DISTRICT_META).toHaveProperty("INDIE_BLOCKS");
    expect(DISTRICT_META).toHaveProperty("DOWNTOWN_PRIME");
    expect(DISTRICT_META).toHaveProperty("LABEL_ROW");
  });

  it("each district has required metadata fields", () => {
    for (const [, meta] of Object.entries(DISTRICT_META)) {
      expect(meta).toHaveProperty("label");
      expect(meta).toHaveProperty("color");
      expect(meta).toHaveProperty("bg");
      expect(meta).toHaveProperty("description");
      expect(meta).toHaveProperty("visibilityMultiplier");
      expect(typeof meta.visibilityMultiplier).toBe("number");
      expect(meta.visibilityMultiplier).toBeGreaterThan(0);
    }
  });

  it("LABEL_ROW has a higher visibility multiplier than DOWNTOWN_PRIME", () => {
    expect(DISTRICT_META.LABEL_ROW.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier
    );
  });

  it("DOWNTOWN_PRIME has a higher visibility multiplier than INDIE_BLOCKS", () => {
    expect(DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.INDIE_BLOCKS.visibilityMultiplier
    );
  });
});
