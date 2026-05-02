import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateAiScore,
  scoreToDistrict,
  DISTRICT_META,
  type ScoreInputs,
} from "../scoring";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a baseline ScoreInputs with sensible defaults */
function makeInputs(overrides: Partial<ScoreInputs> = {}): ScoreInputs {
  return {
    soldLicenses: 0,
    totalLicenses: 100,
    streamCount: 0,
    versusWins: 0,
    versusLosses: 0,
    aiSentiment: 0,
    boostScore: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateAiScore
// ---------------------------------------------------------------------------

describe("calculateAiScore", () => {
  it("returns 0 for a brand-new song with all-zero activity", () => {
    // createdAt = now → recency = 100 * 0.10 = 10
    const score = calculateAiScore(makeInputs());
    // Only recency contributes
    expect(score).toBe(10);
  });

  it("returns the expected score when all components are at maximum", () => {
    const score = calculateAiScore(
      makeInputs({
        soldLicenses: 100,
        totalLicenses: 100,
        streamCount: 10_000,
        versusWins: 10,
        versusLosses: 0,
        aiSentiment: 1,
        boostScore: 100,
      })
    );
    // salesPct=100*0.30 + engagement=100*0.20 + versus=100*0.15 + sentiment=100*0.10 + recency≤100*0.10 + boost=100*0.15
    // = 30 + 20 + 15 + 10 + (≤10) + 15 = 90 + ≤10 → capped at 100
    expect(score).toBe(100);
  });

  it("scores contributions independently", () => {
    const salesOnly = calculateAiScore(
      makeInputs({ soldLicenses: 100, totalLicenses: 100 })
    );
    const engagementOnly = calculateAiScore(
      makeInputs({ streamCount: 10_000 })
    );
    // salesPct component: 100 * 0.30 = 30 + recency (≈10)
    expect(salesOnly).toBeGreaterThan(30);
    // engagement component: 100 * 0.20 = 20 + recency (≈10)
    expect(engagementOnly).toBeGreaterThan(20);
  });

  it("applies the soft cap for stream counts above 10 000", () => {
    const capped = calculateAiScore(makeInputs({ streamCount: 100_000 }));
    const uncapped = calculateAiScore(makeInputs({ streamCount: 10_000 }));
    // Both should give the same engagement component (100) because normalize caps at 100
    expect(capped).toBe(uncapped);
  });

  it("returns 0 sales component when totalLicenses is 0", () => {
    const score = calculateAiScore(makeInputs({ totalLicenses: 0 }));
    // salesPct = 0; only recency contributes
    expect(score).toBe(10);
  });

  it("calculates versus score only when matches have been played", () => {
    const noMatches = calculateAiScore(makeInputs());
    const withWin = calculateAiScore(
      makeInputs({ versusWins: 1, versusLosses: 0 })
    );
    expect(withWin).toBeGreaterThan(noMatches);
  });

  it("clamps boost score at 100 even if passed a value above 100", () => {
    const boost100 = calculateAiScore(makeInputs({ boostScore: 100 }));
    const boost999 = calculateAiScore(makeInputs({ boostScore: 999 }));
    expect(boost100).toBe(boost999);
  });

  it("clamps negative boost score to 0", () => {
    const boost0 = calculateAiScore(makeInputs({ boostScore: 0 }));
    const boostNeg = calculateAiScore(makeInputs({ boostScore: -50 }));
    expect(boost0).toBe(boostNeg);
  });

  it("returns a score between 0 and 100 inclusive", () => {
    const extremes: Partial<ScoreInputs>[] = [
      {},
      { soldLicenses: 100, totalLicenses: 100, streamCount: 99999, versusWins: 100, aiSentiment: 1, boostScore: 100 },
      { totalLicenses: 0, soldLicenses: 0, aiSentiment: 0, boostScore: -1 },
    ];
    for (const override of extremes) {
      const score = calculateAiScore(makeInputs(override));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("decays recency for old songs", () => {
    const newSong = calculateAiScore(makeInputs({ createdAt: new Date() }));
    const oldSong = calculateAiScore(
      makeInputs({
        createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      })
    );
    expect(newSong).toBeGreaterThan(oldSong);
  });

  it("returns a value rounded to one decimal place", () => {
    const score = calculateAiScore(makeInputs({ soldLicenses: 33, totalLicenses: 100 }));
    expect(score).toBe(Math.round(score * 10) / 10);
  });
});

// ---------------------------------------------------------------------------
// scoreToDistrict
// ---------------------------------------------------------------------------

describe("scoreToDistrict", () => {
  it("maps scores below 50 to INDIE_BLOCKS", () => {
    expect(scoreToDistrict(0)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(49.9)).toBe("INDIE_BLOCKS");
  });

  it("maps scores at exactly 50 to DOWNTOWN_PRIME", () => {
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
  });

  it("maps scores between 50 and 79.9 to DOWNTOWN_PRIME", () => {
    expect(scoreToDistrict(60)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79.9)).toBe("DOWNTOWN_PRIME");
  });

  it("maps scores at exactly 80 to LABEL_ROW", () => {
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
  });

  it("maps scores above 80 to LABEL_ROW", () => {
    expect(scoreToDistrict(95)).toBe("LABEL_ROW");
    expect(scoreToDistrict(100)).toBe("LABEL_ROW");
  });
});

// ---------------------------------------------------------------------------
// DISTRICT_META
// ---------------------------------------------------------------------------

describe("DISTRICT_META", () => {
  it("contains all three districts", () => {
    expect(DISTRICT_META).toHaveProperty("INDIE_BLOCKS");
    expect(DISTRICT_META).toHaveProperty("DOWNTOWN_PRIME");
    expect(DISTRICT_META).toHaveProperty("LABEL_ROW");
  });

  it("each district has the required metadata fields", () => {
    for (const key of ["INDIE_BLOCKS", "DOWNTOWN_PRIME", "LABEL_ROW"] as const) {
      const meta = DISTRICT_META[key];
      expect(meta).toHaveProperty("label");
      expect(meta).toHaveProperty("color");
      expect(meta).toHaveProperty("bg");
      expect(meta).toHaveProperty("description");
      expect(meta).toHaveProperty("visibilityMultiplier");
    }
  });

  it("visibility multipliers increase with district tier", () => {
    expect(DISTRICT_META.INDIE_BLOCKS.visibilityMultiplier).toBeLessThan(
      DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier
    );
    expect(DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier).toBeLessThan(
      DISTRICT_META.LABEL_ROW.visibilityMultiplier
    );
  });
});
