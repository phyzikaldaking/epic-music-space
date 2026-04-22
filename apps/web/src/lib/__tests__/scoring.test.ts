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

/** A "perfect" song: fully sold, max streams, undefeated, max sentiment, brand new, max boost */
const perfectInputs: ScoreInputs = {
  soldLicenses: 100,
  totalLicenses: 100,
  streamCount: 10_000,
  versusWins: 100,
  versusLosses: 0,
  aiSentiment: 1,
  boostScore: 100,
  createdAt: new Date(), // just created → maximum recency
};

/** A completely flat / zero song */
const zeroInputs: ScoreInputs = {
  soldLicenses: 0,
  totalLicenses: 100,
  streamCount: 0,
  versusWins: 0,
  versusLosses: 0,
  aiSentiment: 0,
  boostScore: 0,
  createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // 400 days ago → zero recency
};

// ─────────────────────────────────────────────────────────
// calculateAiScore
// ─────────────────────────────────────────────────────────

describe("calculateAiScore", () => {
  it("returns a score between 0 and 100 for the perfect song", () => {
    const score = calculateAiScore(perfectInputs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 100 for the perfect song", () => {
    const score = calculateAiScore(perfectInputs);
    expect(score).toBe(100);
  });

  it("returns 0 for an all-zero song that is old", () => {
    const score = calculateAiScore(zeroInputs);
    expect(score).toBe(0);
  });

  it("returns a number rounded to one decimal place", () => {
    const inputs: ScoreInputs = {
      soldLicenses: 33,
      totalLicenses: 100,
      streamCount: 3000,
      versusWins: 5,
      versusLosses: 5,
      aiSentiment: 0.6,
      boostScore: 20,
      createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
    };
    const score = calculateAiScore(inputs);
    // Verify at most one decimal place
    expect(score).toBe(Math.round(score * 10) / 10);
  });

  it("handles totalLicenses = 0 without throwing (salesPct defaults to 0)", () => {
    const inputs: ScoreInputs = {
      ...zeroInputs,
      soldLicenses: 0,
      totalLicenses: 0,
      createdAt: new Date(),
    };
    const score = calculateAiScore(inputs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("clamps boost above 100 to 100", () => {
    const withOverBoost: ScoreInputs = { ...perfectInputs, boostScore: 9999 };
    const capped: ScoreInputs = { ...perfectInputs, boostScore: 100 };
    expect(calculateAiScore(withOverBoost)).toBe(calculateAiScore(capped));
  });

  it("clamps boost below 0 to 0", () => {
    const withNegBoost: ScoreInputs = { ...zeroInputs, boostScore: -50, createdAt: new Date() };
    const withZeroBoost: ScoreInputs = { ...zeroInputs, boostScore: 0, createdAt: new Date() };
    expect(calculateAiScore(withNegBoost)).toBe(calculateAiScore(withZeroBoost));
  });

  it("gives higher score to a song with more streams", () => {
    const base: ScoreInputs = { ...zeroInputs, createdAt: new Date() };
    const moreStreams: ScoreInputs = { ...base, streamCount: 5000 };
    expect(calculateAiScore(moreStreams)).toBeGreaterThan(calculateAiScore(base));
  });

  it("gives higher score to a song with more versus wins", () => {
    const base: ScoreInputs = {
      ...zeroInputs,
      createdAt: new Date(),
      versusWins: 0,
      versusLosses: 1,
    };
    const moreWins: ScoreInputs = {
      ...base,
      versusWins: 1,
      versusLosses: 0,
    };
    expect(calculateAiScore(moreWins)).toBeGreaterThan(calculateAiScore(base));
  });

  it("gives higher score to a newer song (higher recency)", () => {
    const oldSong: ScoreInputs = {
      ...zeroInputs,
      createdAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000),
    };
    const newSong: ScoreInputs = {
      ...zeroInputs,
      createdAt: new Date(),
    };
    expect(calculateAiScore(newSong)).toBeGreaterThan(calculateAiScore(oldSong));
  });

  it("soft-caps streams at 10,000 (10k and 20k streams yield same engagement component)", () => {
    const at10k: ScoreInputs = { ...perfectInputs, streamCount: 10_000 };
    const at20k: ScoreInputs = { ...perfectInputs, streamCount: 20_000 };
    expect(calculateAiScore(at10k)).toBe(calculateAiScore(at20k));
  });

  it("treats 0 versus matches (wins+losses=0) as 0 versus score", () => {
    const noVersus: ScoreInputs = {
      ...zeroInputs,
      createdAt: new Date(),
      versusWins: 0,
      versusLosses: 0,
    };
    const withLoss: ScoreInputs = {
      ...zeroInputs,
      createdAt: new Date(),
      versusWins: 0,
      versusLosses: 1,
    };
    // No versus data → versusScore = 0. One loss → versusScore = 0 too.
    expect(calculateAiScore(noVersus)).toBe(calculateAiScore(withLoss));
  });

  it("respects aiSentiment scaling (0→0, 1→100)", () => {
    const low: ScoreInputs = { ...zeroInputs, createdAt: new Date(), aiSentiment: 0 };
    const high: ScoreInputs = { ...zeroInputs, createdAt: new Date(), aiSentiment: 1 };
    expect(calculateAiScore(high)).toBeGreaterThan(calculateAiScore(low));
  });
});

// ─────────────────────────────────────────────────────────
// scoreToDistrict
// ─────────────────────────────────────────────────────────

describe("scoreToDistrict", () => {
  it("maps score >= 80 to LABEL_ROW", () => {
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
    expect(scoreToDistrict(100)).toBe("LABEL_ROW");
    expect(scoreToDistrict(95)).toBe("LABEL_ROW");
  });

  it("maps score >= 50 and < 80 to DOWNTOWN_PRIME", () => {
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79.9)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(65)).toBe("DOWNTOWN_PRIME");
  });

  it("maps score < 50 to INDIE_BLOCKS", () => {
    expect(scoreToDistrict(0)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(49.9)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(25)).toBe("INDIE_BLOCKS");
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

  it("LABEL_ROW has the highest visibilityMultiplier", () => {
    expect(DISTRICT_META.LABEL_ROW.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier
    );
    expect(DISTRICT_META.DOWNTOWN_PRIME.visibilityMultiplier).toBeGreaterThan(
      DISTRICT_META.INDIE_BLOCKS.visibilityMultiplier
    );
  });

  it("each district has required metadata fields", () => {
    for (const meta of Object.values(DISTRICT_META)) {
      expect(meta).toHaveProperty("label");
      expect(meta).toHaveProperty("color");
      expect(meta).toHaveProperty("description");
      expect(meta).toHaveProperty("visibilityMultiplier");
    }
  });
});
