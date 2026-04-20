import { describe, it, expect } from "vitest";
import {
  calculateAiScore,
  scoreToDistrict,
  DISTRICT_META,
  type ScoreInputs,
} from "../../lib/scoring";

// A "perfect" set of inputs that would yield a very high score
const perfectInputs: ScoreInputs = {
  soldLicenses: 100,
  totalLicenses: 100,
  streamCount: 10_000,
  versusWins: 50,
  versusLosses: 0,
  aiSentiment: 1.0,
  boostScore: 100,
  createdAt: new Date(), // brand new → max recency
};

// A "zero" set of inputs
const zeroInputs: ScoreInputs = {
  soldLicenses: 0,
  totalLicenses: 100,
  streamCount: 0,
  versusWins: 0,
  versusLosses: 0,
  aiSentiment: 0,
  boostScore: 0,
  createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year old
};

describe("calculateAiScore", () => {
  it("returns a number", () => {
    expect(typeof calculateAiScore(perfectInputs)).toBe("number");
  });

  it("score is always between 0 and 100", () => {
    const highScore = calculateAiScore(perfectInputs);
    const lowScore = calculateAiScore(zeroInputs);
    expect(highScore).toBeGreaterThanOrEqual(0);
    expect(highScore).toBeLessThanOrEqual(100);
    expect(lowScore).toBeGreaterThanOrEqual(0);
    expect(lowScore).toBeLessThanOrEqual(100);
  });

  it("rounds to one decimal place", () => {
    const score = calculateAiScore({
      ...zeroInputs,
      streamCount: 3333,
      aiSentiment: 0.333,
    });
    // Check it has at most 1 decimal digit
    expect(score).toBe(Math.round(score * 10) / 10);
  });

  it("higher sales produce a higher score than zero sales", () => {
    const withSales = calculateAiScore({
      ...zeroInputs,
      soldLicenses: 80,
      totalLicenses: 100,
      createdAt: new Date(), // same recency
    });
    const withoutSales = calculateAiScore({
      ...zeroInputs,
      createdAt: new Date(),
    });
    expect(withSales).toBeGreaterThan(withoutSales);
  });

  it("higher stream count produces a higher score", () => {
    const highStreams = calculateAiScore({
      ...zeroInputs,
      streamCount: 10_000,
      createdAt: new Date(),
    });
    const lowStreams = calculateAiScore({
      ...zeroInputs,
      streamCount: 0,
      createdAt: new Date(),
    });
    expect(highStreams).toBeGreaterThan(lowStreams);
  });

  it("higher versus win rate produces a higher score", () => {
    const allWins = calculateAiScore({
      ...zeroInputs,
      versusWins: 10,
      versusLosses: 0,
      createdAt: new Date(),
    });
    const allLosses = calculateAiScore({
      ...zeroInputs,
      versusWins: 0,
      versusLosses: 10,
      createdAt: new Date(),
    });
    expect(allWins).toBeGreaterThan(allLosses);
  });

  it("no versus matches produces zero versus score component", () => {
    const noVersus = calculateAiScore({
      ...zeroInputs,
      versusWins: 0,
      versusLosses: 0,
      createdAt: new Date(),
    });
    // This is just testing it doesn't throw or return NaN
    expect(noVersus).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(noVersus)).toBe(false);
  });

  it("aiSentiment of 1.0 produces maximum sentiment contribution", () => {
    const highSentiment = calculateAiScore({
      ...zeroInputs,
      aiSentiment: 1.0,
      createdAt: new Date(),
    });
    const lowSentiment = calculateAiScore({
      ...zeroInputs,
      aiSentiment: 0.0,
      createdAt: new Date(),
    });
    expect(highSentiment).toBeGreaterThan(lowSentiment);
  });

  it("clamps aiSentiment values above 1.0 to max of 10 points contribution", () => {
    // aiSentiment > 1 should not push score above what aiSentiment=1 gives
    const clamped = calculateAiScore({
      ...zeroInputs,
      aiSentiment: 999,
      createdAt: new Date(),
    });
    const maxSentiment = calculateAiScore({
      ...zeroInputs,
      aiSentiment: 1.0,
      createdAt: new Date(),
    });
    expect(clamped).toBe(maxSentiment);
  });

  it("boostScore of 100 increases score compared to boostScore of 0", () => {
    const boosted = calculateAiScore({
      ...zeroInputs,
      boostScore: 100,
      createdAt: new Date(),
    });
    const unboosted = calculateAiScore({
      ...zeroInputs,
      boostScore: 0,
      createdAt: new Date(),
    });
    expect(boosted).toBeGreaterThan(unboosted);
  });

  it("boostScore is clamped between 0 and 100", () => {
    const overBoosted = calculateAiScore({
      ...zeroInputs,
      boostScore: 999,
      createdAt: new Date(),
    });
    const maxBoosted = calculateAiScore({
      ...zeroInputs,
      boostScore: 100,
      createdAt: new Date(),
    });
    expect(overBoosted).toBe(maxBoosted);
  });

  it("brand-new song has higher recency score than year-old song", () => {
    const newSong = calculateAiScore({
      ...zeroInputs,
      createdAt: new Date(),
    });
    const oldSong = calculateAiScore({
      ...zeroInputs,
      createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    });
    expect(newSong).toBeGreaterThan(oldSong);
  });

  it("totalLicenses of 0 results in 0 sales percentage (no division by zero)", () => {
    const score = calculateAiScore({
      ...zeroInputs,
      soldLicenses: 0,
      totalLicenses: 0,
      createdAt: new Date(),
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(score)).toBe(false);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("overall score never exceeds 100", () => {
    const score = calculateAiScore(perfectInputs);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("overall score is never negative", () => {
    const score = calculateAiScore(zeroInputs);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("scoreToDistrict", () => {
  it("returns INDIE_BLOCKS for scores below 50", () => {
    expect(scoreToDistrict(0)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(25)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(49.9)).toBe("INDIE_BLOCKS");
  });

  it("returns DOWNTOWN_PRIME for scores between 50 and 79", () => {
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(65)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79.9)).toBe("DOWNTOWN_PRIME");
  });

  it("returns LABEL_ROW for scores of 80 and above", () => {
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
    expect(scoreToDistrict(95)).toBe("LABEL_ROW");
    expect(scoreToDistrict(100)).toBe("LABEL_ROW");
  });

  it("handles boundary values precisely", () => {
    expect(scoreToDistrict(49)).toBe("INDIE_BLOCKS");
    expect(scoreToDistrict(50)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(79)).toBe("DOWNTOWN_PRIME");
    expect(scoreToDistrict(80)).toBe("LABEL_ROW");
  });
});

describe("DISTRICT_META", () => {
  it("contains all three district keys", () => {
    expect(DISTRICT_META).toHaveProperty("INDIE_BLOCKS");
    expect(DISTRICT_META).toHaveProperty("DOWNTOWN_PRIME");
    expect(DISTRICT_META).toHaveProperty("LABEL_ROW");
  });

  it("each district has a label, color, bg, description and visibilityMultiplier", () => {
    for (const district of Object.values(DISTRICT_META)) {
      expect(district).toHaveProperty("label");
      expect(district).toHaveProperty("color");
      expect(district).toHaveProperty("bg");
      expect(district).toHaveProperty("description");
      expect(district).toHaveProperty("visibilityMultiplier");
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
