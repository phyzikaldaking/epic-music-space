import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  clamp,
  truncate,
  availabilityPct,
} from "./index";

// ─────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("converts cents to a USD-formatted string", () => {
    expect(formatCurrency(4999)).toBe("$49.99");
  });

  it("formats zero cents as $0.00", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats one cent", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("formats a whole-dollar amount", () => {
    expect(formatCurrency(100)).toBe("$1.00");
  });

  it("formats a large amount with thousands separator", () => {
    expect(formatCurrency(1_000_000)).toBe("$10,000.00");
  });

  it("formats negative cents (produces a negative dollar amount)", () => {
    // Negative input should produce a negative dollar string
    expect(formatCurrency(-100)).toBe("-$1.00");
  });
});

// ─────────────────────────────────────────────────────────
// formatPrice
// ─────────────────────────────────────────────────────────

describe("formatPrice", () => {
  it("formats a numeric string", () => {
    expect(formatPrice("49.99")).toBe("$49.99");
  });

  it("formats a plain number", () => {
    expect(formatPrice(49.99)).toBe("$49.99");
  });

  it("formats zero as string", () => {
    expect(formatPrice("0")).toBe("$0.00");
  });

  it("formats zero as number", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("formats a large number with thousands separator", () => {
    expect(formatPrice(10000)).toBe("$10,000.00");
  });

  it("formats a string with many decimal places (truncates to 2)", () => {
    expect(formatPrice("9.999")).toBe("$10.00");
  });
});

// ─────────────────────────────────────────────────────────
// clamp
// ─────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns the value when it is within the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to the min when value is below range", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
  });

  it("clamps to the max when value is above range", () => {
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("returns min when value exactly equals min", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it("returns max when value exactly equals max", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("works with floating-point values", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it("works with negative ranges", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
  });

  it("clamps to min in a negative range", () => {
    expect(clamp(-15, -10, -1)).toBe(-10);
  });

  it("clamps to max in a negative range", () => {
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────
// truncate
// ─────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the string unchanged when it is shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when length exactly equals maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when string exceeds maxLength", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("handles an empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("produces only ellipsis when maxLength is 3 and string is longer", () => {
    expect(truncate("hello", 3)).toBe("...");
  });

  it("truncates leaving one visible character before ellipsis", () => {
    // str.length (6) > maxLength (5) → slice(0, 2) + '...' = 'ab...'
    expect(truncate("abcdef", 5)).toBe("ab...");
  });

  it("truncates a long sentence correctly", () => {
    expect(truncate("The quick brown fox", 10)).toBe("The qui...");
  });
});

// ─────────────────────────────────────────────────────────
// availabilityPct
// ─────────────────────────────────────────────────────────

describe("availabilityPct", () => {
  it("returns 100 when nothing is sold", () => {
    expect(availabilityPct(0, 100)).toBe(100);
  });

  it("returns 50 when half the licenses are sold", () => {
    expect(availabilityPct(50, 100)).toBe(50);
  });

  it("returns 0 when fully sold out", () => {
    expect(availabilityPct(100, 100)).toBe(0);
  });

  it("returns 0 when total is zero (guard against division-by-zero)", () => {
    expect(availabilityPct(0, 0)).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    // (3 - 1) / 3 * 100 = 66.67 → rounds to 67
    expect(availabilityPct(1, 3)).toBe(67);
  });

  it("handles a single-license catalog with one sold", () => {
    expect(availabilityPct(1, 1)).toBe(0);
  });

  it("handles a single-license catalog with none sold", () => {
    expect(availabilityPct(0, 1)).toBe(100);
  });
});
