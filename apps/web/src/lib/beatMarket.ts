export type BeatTierId = "standard" | "premium" | "oneofone";

export const beatTiers = [
  { id: "standard", name: "Standard", multiplier: 1, maxSupply: 100 },
  { id: "premium", name: "Premium", multiplier: 2.5, maxSupply: 25 },
  { id: "oneofone", name: "One of One", multiplier: 12, maxSupply: 1 },
] as const;

export function getBeatTier(tierId: BeatTierId) {
  return beatTiers.find((tier) => tier.id === tierId) ?? beatTiers[0];
}

export function getBeatTierPrice(basePrice: number, tierId: BeatTierId) {
  const tier = getBeatTier(tierId);
  return Math.round(basePrice * tier.multiplier * 100) / 100;
}

export function getResaleSplit(resalePrice: number) {
  const platformPct = 10;
  const artistPct = 15;
  const sellerPct = 75;
  return {
    resalePrice,
    platformFee: Math.round(resalePrice * platformPct) / 100,
    artistRoyalty: Math.round(resalePrice * artistPct) / 100,
    sellerPayout: Math.round(resalePrice * sellerPct) / 100,
    platformPct,
    artistPct,
    sellerPct,
  };
}

export function getAuctionReserve(basePrice: number) {
  return Math.round(basePrice * 3 * 100) / 100;
}
