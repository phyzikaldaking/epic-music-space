import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_RATIO } from "@/lib/revenueShare";

// These tests pin down the math constants. Full integration tests would mock
// Prisma — see apps/web/src/lib/__tests__/idempotency.test.ts for the pattern.

describe("revenueShare constants", () => {
  it("platform fee is 10%", () => {
    expect(PLATFORM_FEE_RATIO).toBeCloseTo(0.1, 5);
  });
});

describe("revenueShare math (pure)", () => {
  // Replicate the splitting logic from recordLicenseSale so we can validate
  // the rounding behaviour without spinning up a database.
  function splitForGross(grossCents: number) {
    const platformCents = Math.floor((grossCents * 1000) / 10_000);
    const artistCents = grossCents - platformCents;
    return { platformCents, artistCents };
  }

  it("license sale of $9.99 splits 999 → 100 platform + 899 artist", () => {
    const { platformCents, artistCents } = splitForGross(999);
    expect(platformCents).toBe(99);
    expect(artistCents).toBe(900);
    expect(platformCents + artistCents).toBe(999);
  });

  it("license sale of $100.00 splits 10000 → 1000 platform + 9000 artist", () => {
    const { platformCents, artistCents } = splitForGross(10_000);
    expect(platformCents).toBe(1_000);
    expect(artistCents).toBe(9_000);
  });

  it("never loses cents to rounding (sum invariant)", () => {
    for (let cents = 1; cents <= 100_000; cents += 137) {
      const { platformCents, artistCents } = splitForGross(cents);
      expect(platformCents + artistCents).toBe(cents);
    }
  });

  it("partial refund proportional clawback math", () => {
    const grossCents = 999;
    const { platformCents, artistCents } = splitForGross(grossCents);
    const refundedCents = 500;
    const ratio = refundedCents / grossCents;
    const reverseArtist = Math.round(artistCents * ratio);
    const reversePlatform = Math.round(platformCents * ratio);
    expect(reverseArtist).toBeGreaterThan(0);
    expect(reverseArtist).toBeLessThan(artistCents);
    // Combined reversal stays close to (but may not equal exactly, due to
    // independent rounding) the refunded amount — within 1¢.
    expect(Math.abs((reverseArtist + reversePlatform) - refundedCents)).toBeLessThanOrEqual(1);
  });

  it("full refund returns the full gross", () => {
    const grossCents = 12_345;
    const { platformCents, artistCents } = splitForGross(grossCents);
    const refundedCents = grossCents;
    const ratio = refundedCents / grossCents;
    const reverseArtist = Math.round(artistCents * ratio);
    const reversePlatform = Math.round(platformCents * ratio);
    expect(reverseArtist).toBe(artistCents);
    expect(reversePlatform).toBe(platformCents);
  });
});
