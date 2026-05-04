import { describe, expect, it } from "vitest";
import { getMinimumAuctionBid, normalizeUsdAmount } from "@/lib/auctionMath";

describe("normalizeUsdAmount", () => {
  it("rounds to 2 decimal places", () => {
    expect(normalizeUsdAmount(10)).toBe(10);
    expect(normalizeUsdAmount(10.126)).toBe(10.13);
    expect(normalizeUsdAmount(10.124)).toBe(10.12);
  });
});

describe("getMinimumAuctionBid", () => {
  it("uses starting bid when there is no current bid", () => {
    expect(getMinimumAuctionBid(25, null)).toBe(25);
  });

  it("requires one cent above current bid", () => {
    expect(getMinimumAuctionBid(25, 30)).toBe(30.01);
  });

  it("returns normalized value for decimal current bid", () => {
    expect(getMinimumAuctionBid(25, 30.009)).toBe(30.02);
  });
});
