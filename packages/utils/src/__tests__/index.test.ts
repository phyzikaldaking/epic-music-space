import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  clamp,
  truncate,
  availabilityPct,
} from "../index";

// ─────────────────────────────────────────────────────────
// formatCurrency
// ─────────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats whole dollars correctly", () => {
    expect(formatCurrency(4999)).toBe("$49.99");
  });

  it("formats zero cents as $0.00", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats large amounts", () => {
    expect(formatCurrency(100000)).toBe("$1,000.00");
  });

  it("formats a single cent", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("formats negative values", () => {
    // Intl formats negative USD with a minus sign
    expect(formatCurrency(-500)).toBe("-$5.00");
  });

  it("formats prices that produce fractional cents (rounds via Intl)", () => {
    // 1005 cents → $10.05
    expect(formatCurrency(1005)).toBe("$10.05");
  });
});

// ─────────────────────────────────────────────────────────
// formatPrice
// ─────────────────────────────────────────────────────────

describe("formatPrice", () => {
  it("formats a numeric value as USD", () => {
    expect(formatPrice(49.99)).toBe("$49.99");
  });

  it("formats a string numeric value", () => {
    expect(formatPrice("9.50")).toBe("$9.50");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("formats a string '0'", () => {
    expect(formatPrice("0")).toBe("$0.00");
  });

  it("formats large prices", () => {
    expect(formatPrice(10000)).toBe("$10,000.00");
  });

  it("parses a decimal string correctly", () => {
    expect(formatPrice("1234.56")).toBe("$1,234.56");
  });
});

// ─────────────────────────────────────────────────────────
// clamp
// ─────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("returns max when value is above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns value equal to min boundary", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it("returns value equal to max boundary", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("works with negative ranges", () => {
    expect(clamp(-15, -10, -5)).toBe(-10);
    expect(clamp(-3, -10, -5)).toBe(-5);
    expect(clamp(-7, -10, -5)).toBe(-7);
  });

  it("works with float values", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.5, 0, 1)).toBe(1);
    expect(clamp(-0.1, 0, 1)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────
// truncate
// ─────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the string unchanged when within maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when exactly maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when string is too long", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("handles maxLength of 3 (minimum meaningful truncation)", () => {
    expect(truncate("abcdef", 3)).toBe("...");
  });

  it("handles an empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles a string that is exactly one character over the limit", () => {
    expect(truncate("abcde", 4)).toBe("a...");
  });

  it("handles a very long string", () => {
    const long = "a".repeat(500);
    const result = truncate(long, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// availabilityPct
// ─────────────────────────────────────────────────────────

describe("availabilityPct", () => {
  it("returns 100 when nothing is sold (all available)", () => {
    expect(availabilityPct(0, 100)).toBe(100);
  });

  it("returns 50 when half is sold", () => {
    expect(availabilityPct(50, 100)).toBe(50);
  });

  it("returns 0 when everything is sold out", () => {
    expect(availabilityPct(100, 100)).toBe(0);
  });

  it("returns 0 when total is 0 (no division by zero)", () => {
    expect(availabilityPct(0, 0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // 1 sold out of 3 → (2/3)*100 ≈ 66.67 → rounds to 67
    expect(availabilityPct(1, 3)).toBe(67);
  });

  it("returns 100 when none are sold from a large pool", () => {
    expect(availabilityPct(0, 10000)).toBe(100);
  });

  it("handles 1 remaining out of many", () => {
    // (1/100)*100 = 1%
    expect(availabilityPct(99, 100)).toBe(1);
  });
});
