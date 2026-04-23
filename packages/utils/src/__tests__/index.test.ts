import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  clamp,
  truncate,
  availabilityPct,
} from "../index";

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe("formatCurrency", () => {
  it("converts cents to a USD currency string", () => {
    expect(formatCurrency(4999)).toBe("$49.99");
  });

  it("handles whole-dollar amounts", () => {
    expect(formatCurrency(100)).toBe("$1.00");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles a single cent", () => {
    expect(formatCurrency(1)).toBe("$0.01");
  });

  it("handles large amounts", () => {
    expect(formatCurrency(1_000_000)).toBe("$10,000.00");
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------

describe("formatPrice", () => {
  it("formats a numeric value", () => {
    expect(formatPrice(49.99)).toBe("$49.99");
  });

  it("formats a string value", () => {
    expect(formatPrice("49.99")).toBe("$49.99");
  });

  it("formats an object with a toString method (e.g. Decimal)", () => {
    expect(formatPrice({ toString: () => "9.95" })).toBe("$9.95");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
  });

  it("handles large values", () => {
    expect(formatPrice(10_000)).toBe("$10,000.00");
  });
});

// ---------------------------------------------------------------------------
// clamp
// ---------------------------------------------------------------------------

describe("clamp", () => {
  it("returns the value when it is within bounds", () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it("returns min when the value is below the lower bound", () => {
    expect(clamp(-3, 0, 100)).toBe(0);
  });

  it("returns max when the value exceeds the upper bound", () => {
    expect(clamp(200, 0, 100)).toBe(100);
  });

  it("returns min when the value equals min exactly", () => {
    expect(clamp(1, 1, 10)).toBe(1);
  });

  it("returns max when the value equals max exactly", () => {
    expect(clamp(10, 1, 10)).toBe(10);
  });

  it("handles negative bounds", () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns the original string when it is shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the original string when it exactly equals maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when the string exceeds maxLength", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("preserves maxLength by including the ellipsis in the total length", () => {
    const result = truncate("abcdefghij", 7);
    expect(result).toBe("abcd...");
    expect(result.length).toBe(7);
  });

  it("handles an empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles a very short maxLength", () => {
    expect(truncate("hello world", 3)).toBe("...");
  });
});

// ---------------------------------------------------------------------------
// availabilityPct
// ---------------------------------------------------------------------------

describe("availabilityPct", () => {
  it("returns 100 when nothing has been sold", () => {
    expect(availabilityPct(0, 100)).toBe(100);
  });

  it("returns 50 when half the licenses are sold", () => {
    expect(availabilityPct(50, 100)).toBe(50);
  });

  it("returns 0 when all licenses are sold", () => {
    expect(availabilityPct(100, 100)).toBe(0);
  });

  it("returns 0 when total is 0 (division-by-zero guard)", () => {
    expect(availabilityPct(0, 0)).toBe(0);
  });

  it("rounds the result correctly", () => {
    // 1 remaining out of 3 → 33.33... → rounds to 33
    expect(availabilityPct(2, 3)).toBe(33);
  });

  it("handles a single license still available", () => {
    expect(availabilityPct(99, 100)).toBe(1);
  });
});
