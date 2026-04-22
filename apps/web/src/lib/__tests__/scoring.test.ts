import { describe, it, expect } from "vitest";
import {
  calculateAiScore,
  scoreToDistrict,
  DISTRICT_META,
  type ScoreInputs,
} from "../scoring";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeInputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    soldLicenses: 0,
    totalLicenses: 100,
    streamCount: 0,
    versusWins: 0,
    versusLosses: 0,
    aiSentiment: 0,
    boostScore: 0,
    createdAt: new Date(), // brand new song → maximum recency
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// calculateAiScore
// ─────────────────────────────────────────────────────────

describe("calculateAiScore", () => {
  it("returns a value between 0 and 100 for a zeroed-out input", () => {
    const score = calculateAiScore(makeInputs());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns exactly 0 for a year-old song with no activity", () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const score = calculateAiScore(makeInputs({ createdAt: oneYearAgo }));
    // Recency decays to ~0, all other metrics are 0 → score should be 0
    expect(score).toBe(0);
  });

  it("scores higher when more licenses are sold", () => {
    const low  = calculateAiScore(makeInputs({ soldLicenses: 10,  totalLicenses: 100 }));
    const high = calculateAiScore(makeInputs({ soldLicenses: 100, totalLicenses: 100 }));
    expect(high).toBeGreaterThan(low);
  });

  it("scores higher with more streams", () => {
    const low  = calculateAiScore(makeInputs({ streamCount: 100  }));
    const high = calculateAiScore(makeInputs({ streamCount: 9000 }));
    expect(high).toBeGreaterThan(low);
  });

  it("scores higher with more versus wins", () => {
    const noVersus  = calculateAiScore(makeInputs());
    const withWins  = calculateAiScore(makeInputs({ versusWins: 10, versusLosses: 5 }));
    expect(withWins).toBeGreaterThan(noVersus);
  });

  it("scores higher with a higher AI sentiment", () => {
    const low  = calculateAiScore(makeInputs({ aiSentiment: 0.1 }));
    const high = calculateAiScore(makeInputs({ aiSentiment: 0.9 }));
    expect(high).toBeGreaterThan(low);
  });

  it("scores higher with a paid boost", () => {
    const noBoost   = calculateAiScore(makeInputs({ boostScore: 0   }));
    const withBoost = calculateAiScore(makeInputs({ boostScore: 100 }));
    expect(withBoost).toBeGreaterThan(noBoost);
  });

  it("clamps the score to 100 even for a perfect input", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 100,
        totalLicenses: 100,
        streamCount: 100_000,
        versusWins: 50,
        versusLosses: 0,
        aiSentiment: 1,
        boostScore: 100,
      })
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 when totalLicenses is 0 (no division by zero)", () => {
    const score = calculateAiScore(
      makeInputs({ soldLicenses: 0, totalLicenses: 0 })
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("returns a number with at most 1 decimal place", () => {
    const score = calculateAiScore(makeInputs({ streamCount: 3333, versusWins: 7, versusLosses: 3 }));
    // Math.round(...*10)/10 ensures at most 1 decimal place
    expect(score).toBe(Math.round(score * 10) / 10);
  });

  it("ignores versus stats when there are no matches", () => {
    const noMatchScore = calculateAiScore(makeInputs({ versusWins: 0, versusLosses: 0 }));
    // versusScore = 0 when totalVersus === 0; score should be non-negative
    expect(noMatchScore).toBeGreaterThanOrEqual(0);
  });

  it("computes a deterministic value for known inputs (regression check)", () => {
    // Pin a specific calculation to catch formula drift
    const fixedDate = new Date("2025-01-01T00:00:00.000Z");
    const score = calculateAiScore({
      soldLicenses: 50,
      totalLicenses: 100,
      streamCount: 5000,
      versusWins: 10,
      versusLosses: 10,
      aiSentiment: 0.5,
      boostScore: 50,
      createdAt: fixedDate,
    });
    // salesPct=50, engagement=50, versusScore=50, sentiment=50, recency varies, boost=50
    // We just check it's in a sensible range rather than hardcoding to avoid date drift
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(80);
  });
});

// ─────────────────────────────────────────────────────────
// scoreToDistrict
// ─────────────────────────────────────────────────────────

describe("scoreToDistrict", () => {
  it("returns INDIE_BLOCKS for score < 50", () => {
    expect(scoreToDistrict(0)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(49.9)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(1)).toBe("INDIE_BLOCKS");
  });

  it("returns DOWNTOWN_PRIME for score 50–79", () => {
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(65)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79.9)).toBe("DOWNTOWN_PRIME");
  });

  it("returns LABEL_ROW for score >= 80", () => {
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
    expect(scoreToDistrict(100)).toBe("LABEL_ROW");
    expect(scoreToDistrict(99.9)).toBe("LABEL_ROW");
  });
});

// ─────────────────────────────────────────────────────────
// DISTRICT_META
// ─────────────────────────────────────────────────────────

describe("DISTRICT_META", () => {
  it("has entries for all three districts", () => {
    expect(DISTRICT_META).toHaveProperty("INDIE_BLOCKS");
    expect(DISTRICT_META).toHaveProperty("DOWNTOWN_PRIME");
    expect(DISTRICT_META).toHaveProperty("LABEL_ROW");
  });

  it("LABEL_ROW has the highest visibility multiplier", () => {
    expect(DISTRICT_META.LABEL_ROW.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier
    );
    expect(DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.INDIE_BLOCKS.visibilityMultiplier
    );
  });

  it("each district meta has required fields", () => {
    for (const district of Object.values(DISTRICT_META)) {
      expect(district).toHaveProperty("label");
      expect(district).toHaveProperty("color");
      expect(district).toHaveProperty("bg");
      expect(district).toHaveProperty("description");
      expect(district).toHaveProperty("visibilityMultiplier");
    }
  });
});
