import { describe, expect, it } from "vitest";
import { validateTrustSafetyInput } from "@/lib/trustSafety";

describe("validateTrustSafetyInput", () => {
  it("allows normal music content", () => {
    const verdict = validateTrustSafetyInput("New beat pack out now", "https://epicmusicspace.com/track/abc");
    expect(verdict).toEqual({ ok: true });
  });

  it("blocks known adult domains", () => {
    const verdict = validateTrustSafetyInput("check this", "https://onlyfans.com/example");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("ADULT_PROMO");
    }
  });

  it("blocks explicit adult promo language", () => {
    const verdict = validateTrustSafetyInput("18+ cam site in bio");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("ADULT_PROMO");
    }
  });

  it("blocks link spam", () => {
    const verdict = validateTrustSafetyInput(
      "https://a.com https://b.com https://c.com https://d.com",
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("SPAM_PROMO");
    }
  });

  it("blocks high-risk scam phrases", () => {
    const verdict = validateTrustSafetyInput("Buy followers now, guaranteed income");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("SPAM_PROMO");
    }
  });

  it("blocks shortened links", () => {
    const verdict = validateTrustSafetyInput("promo", "https://bit.ly/abc123");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("SPAM_PROMO");
    }
  });

  it("blocks adult links by hostname", () => {
    const verdict = validateTrustSafetyInput("promo", "https://creator.onlyfans.com/me");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.code).toBe("ADULT_PROMO");
    }
  });
});
