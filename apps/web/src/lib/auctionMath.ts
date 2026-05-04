export function normalizeUsdAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function getMinimumAuctionBid(startingBid: number, currentBid: number | null) {
  const base = currentBid == null ? startingBid : currentBid + 0.01;
  return normalizeUsdAmount(base);
}
