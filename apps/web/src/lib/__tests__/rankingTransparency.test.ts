import { describe, expect, it } from "vitest";
import { computeRankingTransparency } from "@/lib/rankingTransparency";

describe("computeRankingTransparency", () => {
  it("caps paid influence when requested boost is too high", () => {
    const result = computeRankingTransparency({
      aiScore: 70,
      boostScore: 99,
      soldLicenses: 40,
      totalLicenses: 100,
      streamCount: 4000,
      versusWins: 8,
      versusLosses: 2,
      createdAt: new Date("2026-04-01T00:00:00Z"),
    });

    expect(result.paidBoostCapped).toBe(true);
    expect(result.paidApplied).toBeLessThanOrEqual(result.paidCap);
    expect(result.paidApplied).toBeLessThan(result.paidRequested);
  });

  it("keeps paid influence modest relative to total score", () => {
    const result = computeRankingTransparency({
      aiScore: 65,
      boostScore: 30,
      soldLicenses: 18,
      totalLicenses: 80,
      streamCount: 2200,
      versusWins: 3,
      versusLosses: 2,
      createdAt: new Date("2026-02-10T00:00:00Z"),
    });

    expect(result.paidInfluencePct).toBeLessThan(25);
    expect(result.finalScore).toBeGreaterThan(result.organicScore);
  });
});
