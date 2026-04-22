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
  it("formats whole-dollar amounts", () => {
    expect(formatCurrency(500)).toBe("$5.00");
  });

  it("formats fractional cents into dollars and cents", () => {
    expect(formatCurrency(4999)).toBe("$49.99");
  });

  it("formats zero as $0.00", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats large values correctly", () => {
    expect(formatCurrency(1_000_000)).toBe("$10,000.00");
  });

  it("formats 1 cent as $0.01", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("formats negative values", () => {
    expect(formatCurrency(-100)).toBe("-$1.00");
  });
});

// ─────────────────────────────────────────────────────────
// formatPrice
// ─────────────────────────────────────────────────────────

describe("formatPrice", () => {
  it("formats a numeric value as USD currency", () => {
    expect(formatPrice(49.99)).toBe("$49.99");
  });

  it("formats a string value parsed to float", () => {
    expect(formatPrice("9.99")).toBe("$9.99");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("formats whole-number strings", () => {
    expect(formatPrice("100")).toBe("$100.00");
  });

  it("formats large numbers with thousand separators", () => {
    expect(formatPrice(1000)).toBe("$1,000.00");
  });

  it("formats negative numbers", () => {
    expect(formatPrice(-5)).toBe("-$5.00");
  });
});

// ─────────────────────────────────────────────────────────
// clamp
// ─────────────────────────────────────────────────────────

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("returns max when value is above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns min when value equals min", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it("returns max when value equals max", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("handles floating point values", () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(-0.1, 0, 1)).toBe(0);
    expect(clamp(1.1, 0, 1)).toBe(1);
  });

  it("handles negative ranges", () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });
});

// ─────────────────────────────────────────────────────────
// truncate
// ─────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the string unchanged when it fits within maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when length equals maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when string exceeds maxLength", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("truncates a long string to exactly maxLength chars", () => {
    const result = truncate("abcdefghij", 7);
    expect(result).toBe("abcd...");
    expect(result.length).toBe(7);
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles maxLength of 3 (edge: only ellipsis)", () => {
    expect(truncate("abcdef", 3)).toBe("...");
  });

  it("handles maxLength of 4", () => {
    expect(truncate("abcdef", 4)).toBe("a...");
  });
});

// ─────────────────────────────────────────────────────────
// availabilityPct
// ─────────────────────────────────────────────────────────

describe("availabilityPct", () => {
  it("returns 0 when total is 0 to avoid division by zero", () => {
    expect(availabilityPct(0, 0)).toBe(0);
  });

  it("returns 100 when none have been sold", () => {
    expect(availabilityPct(0, 100)).toBe(100);
  });

  it("returns 0 when all licenses are sold", () => {
    expect(availabilityPct(100, 100)).toBe(0);
  });

  it("returns 50 when half are sold", () => {
    expect(availabilityPct(50, 100)).toBe(50);
  });

  it("rounds to the nearest integer", () => {
    // 1 sold out of 3 → (2/3)*100 ≈ 66.67 → rounds to 67
    expect(availabilityPct(1, 3)).toBe(67);
  });

  it("handles sold slightly less than total", () => {
    expect(availabilityPct(99, 100)).toBe(1);
  });

  it("handles sold of 1", () => {
    expect(availabilityPct(1, 100)).toBe(99);
  });
});
