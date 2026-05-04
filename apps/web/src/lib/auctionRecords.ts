type NullableString = string | null | undefined;

export type AuctionRecordViewerInput = {
  viewerId: string;
  sellerId: string;
  winnerId?: NullableString;
  bidderIds?: string[];
  isAdmin?: boolean;
};

export function canViewAuctionRecords(input: AuctionRecordViewerInput) {
  if (input.isAdmin) return true;
  if (input.viewerId === input.sellerId) return true;
  if (input.winnerId && input.viewerId === input.winnerId) return true;
  return (input.bidderIds ?? []).includes(input.viewerId);
}

export type AuctionRecordBid = {
  amount: number;
  createdAt: Date;
  bidderId: string;
};

export type AuctionRecordExport = {
  id: string;
  status: string;
  createdAt: Date;
  endsAt: Date;
  settledAt?: Date | null;
  songId: string;
  songTitle: string;
  songArtist: string;
  sellerId: string;
  sellerName?: NullableString;
  winnerId?: NullableString;
  winnerName?: NullableString;
  startingBid: number;
  reservePrice?: number | null;
  currentBid?: number | null;
  bids: AuctionRecordBid[];
  transactionId?: NullableString;
  transactionStatus?: NullableString;
  transactionAmount?: number | null;
};

function escapeCsvCell(value: string | number) {
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replaceAll("\"", "\"\"")}"`;
  }
  return raw;
}

function formatAmount(value: number | null | undefined) {
  return value == null ? "" : value.toFixed(2);
}

export function buildAuctionRecordsCsv(data: AuctionRecordExport) {
  const header = ["row_type", "timestamp_utc", "actor_id", "amount_usd", "detail"];
  const rows: Array<Array<string>> = [
    [
      "AUCTION_SUMMARY",
      data.createdAt.toISOString(),
      data.sellerId,
      formatAmount(data.currentBid ?? data.startingBid),
      `auction=${data.id};status=${data.status};song=${data.songTitle}`,
    ],
  ];

  for (const bid of data.bids) {
    rows.push([
      "BID",
      bid.createdAt.toISOString(),
      bid.bidderId,
      formatAmount(bid.amount),
      `auction=${data.id}`,
    ]);
  }

  if (data.transactionId) {
    rows.push([
      "SETTLEMENT",
      (data.settledAt ?? data.endsAt).toISOString(),
      data.winnerId ?? "",
      formatAmount(data.transactionAmount),
      `transaction=${data.transactionId};status=${data.transactionStatus ?? "UNKNOWN"}`,
    ]);
  }

  return [
    header.map((cell) => escapeCsvCell(cell)).join(","),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
  ].join("\n");
}

export function buildAuctionRecordFileName(auctionId: string, ext: "csv" | "json") {
  return `auction-records-${auctionId}.${ext}`;
}
