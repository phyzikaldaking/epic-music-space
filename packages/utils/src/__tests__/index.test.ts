import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPrice,
  clamp,
  truncate,
  availabilityPct,
} from "../index";

describe("formatCurrency", () => {
  it("formats cents to USD currency string", () => {
    expect(formatCurrency(4999)).toBe("$49.99");
  });

  it("formats zero cents", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats whole dollar amounts", () => {
    expect(formatCurrency(100)).toBe("$1.00");
    expect(formatCurrency(10000)).toBe("$100.00");
  });

  it("formats large amounts", () => {
    expect(formatCurrency(100000)).toBe("$1,000.00");
  });

  it("formats sub-cent amounts (rounds via Intl)", () => {
    // 1 cent = $0.01
    expect(formatCurrency(1)).toBe("$0.01");
  });
});

describe("formatPrice", () => {
  it("formats a numeric value as USD currency string", () => {
    expect(formatPrice(49.99)).toBe("$49.99");
  });

  it("formats a string value parsed as float", () => {
    expect(formatPrice("49.99")).toBe("$49.99");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice("0")).toBe("$0.00");
  });

  it("formats whole numbers", () => {
    expect(formatPrice(100)).toBe("$100.00");
    expect(formatPrice("100")).toBe("$100.00");
  });

  it("formats large prices with comma separators", () => {
    expect(formatPrice(1000)).toBe("$1,000.00");
  });
});

describe("clamp", () => {
  it("returns the value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("clamps to min when value is below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, -50, 50)).toBe(-50);
  });

  it("clamps to max when value is above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(1000, 0, 100)).toBe(100);
  });

  it("handles min equal to max", () => {
    expect(clamp(5, 7, 7)).toBe(7);
    expect(clamp(10, 7, 7)).toBe(7);
  });

  it("handles negative ranges", () => {
    expect(clamp(-3, -10, -1)).toBe(-3);
    expect(clamp(0, -10, -1)).toBe(-1);
    expect(clamp(-20, -10, -1)).toBe(-10);
  });
});

describe("truncate", () => {
  it("returns the string unchanged when shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the string unchanged when equal to maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when longer than maxLength", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
  });

  it("truncates to exactly maxLength characters including ellipsis", () => {
    const result = truncate("abcdefghij", 7);
    expect(result).toHaveLength(7);
    expect(result).toBe("abcd...");
  });

  it("handles maxLength of 3 (only ellipsis)", () => {
    expect(truncate("hello", 3)).toBe("...");
  });

  it("handles an empty string", () => {
    expect(truncate("", 5)).toBe("");
    expect(truncate("", 0)).toBe("");
  });

  it("handles a long string truncation", () => {
    const long = "a".repeat(200);
    const result = truncate(long, 50);
    expect(result).toHaveLength(50);
    expect(result.endsWith("...")).toBe(true);
  });
});

describe("availabilityPct", () => {
  it("returns 0 when total is 0 (division guard)", () => {
    expect(availabilityPct(0, 0)).toBe(0);
    expect(availabilityPct(5, 0)).toBe(0);
  });

  it("returns 100 when nothing has been sold", () => {
    expect(availabilityPct(0, 100)).toBe(100);
  });

  it("returns 0 when all licenses are sold", () => {
    expect(availabilityPct(100, 100)).toBe(0);
  });

  it("returns 50 when half are sold", () => {
    expect(availabilityPct(50, 100)).toBe(50);
  });

  it("rounds to nearest integer", () => {
    // 1 sold out of 3 → (2/3) * 100 ≈ 66.67 → rounds to 67
    expect(availabilityPct(1, 3)).toBe(67);
  });

  it("handles single license scenarios", () => {
    expect(availabilityPct(0, 1)).toBe(100);
    expect(availabilityPct(1, 1)).toBe(0);
  });

  it("calculates correctly for partial sales", () => {
    expect(availabilityPct(25, 100)).toBe(75);
    expect(availabilityPct(75, 100)).toBe(25);
  });
});
