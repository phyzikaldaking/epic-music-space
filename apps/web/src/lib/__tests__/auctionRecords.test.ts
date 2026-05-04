import { describe, expect, it } from "vitest";
import {
  buildAuctionRecordFileName,
  buildAuctionRecordsCsv,
  canViewAuctionRecords,
} from "@/lib/auctionRecords";

describe("canViewAuctionRecords", () => {
  it("allows seller, winner, bidder, or admin", () => {
    expect(
      canViewAuctionRecords({
        viewerId: "seller-1",
        sellerId: "seller-1",
        winnerId: "winner-1",
        bidderIds: ["bidder-1"],
      }),
    ).toBe(true);

    expect(
      canViewAuctionRecords({
        viewerId: "winner-1",
        sellerId: "seller-1",
        winnerId: "winner-1",
        bidderIds: ["bidder-1"],
      }),
    ).toBe(true);

    expect(
      canViewAuctionRecords({
        viewerId: "bidder-1",
        sellerId: "seller-1",
        winnerId: "winner-1",
        bidderIds: ["bidder-1"],
      }),
    ).toBe(true);

    expect(
      canViewAuctionRecords({
        viewerId: "viewer-1",
        sellerId: "seller-1",
        winnerId: "winner-1",
        bidderIds: ["bidder-1"],
        isAdmin: true,
      }),
    ).toBe(true);
  });

  it("denies unrelated users", () => {
    expect(
      canViewAuctionRecords({
        viewerId: "viewer-1",
        sellerId: "seller-1",
        winnerId: "winner-1",
        bidderIds: ["bidder-1"],
      }),
    ).toBe(false);
  });
});

describe("buildAuctionRecordsCsv", () => {
  it("builds a csv with summary, bids, and settlement rows", () => {
    const csv = buildAuctionRecordsCsv({
      id: "auc-1",
      status: "SETTLED",
      createdAt: new Date("2026-05-01T10:00:00.000Z"),
      endsAt: new Date("2026-05-02T10:00:00.000Z"),
      settledAt: new Date("2026-05-02T11:00:00.000Z"),
      songId: "song-1",
      songTitle: "Track, \"A\"",
      songArtist: "Artist",
      sellerId: "seller-1",
      sellerName: "Seller",
      winnerId: "winner-1",
      winnerName: "Winner",
      startingBid: 12,
      reservePrice: 20,
      currentBid: 45.5,
      bids: [
        {
          amount: 20,
          createdAt: new Date("2026-05-01T11:00:00.000Z"),
          bidderId: "bidder-1",
        },
      ],
      transactionId: "tx-1",
      transactionStatus: "SUCCEEDED",
      transactionAmount: 45.5,
    });

    const lines = csv.split("\n");
    expect(lines[0]).toBe("row_type,timestamp_utc,actor_id,amount_usd,detail");
    expect(lines[1]).toContain("AUCTION_SUMMARY");
    expect(lines[1]).toContain("\"auction=auc-1;status=SETTLED;song=Track, \"\"A\"\"\"");
    expect(lines[2]).toContain("BID");
    expect(lines[3]).toContain("SETTLEMENT");
  });
});

describe("buildAuctionRecordFileName", () => {
  it("builds stable filenames", () => {
    expect(buildAuctionRecordFileName("abc", "csv")).toBe("auction-records-abc.csv");
    expect(buildAuctionRecordFileName("abc", "json")).toBe("auction-records-abc.json");
  });
});
