// ─────────────────────────────────────────────────────────
// Boost package definitions
// ─────────────────────────────────────────────────────────

export const BOOST_PACKAGES = {
  plays_1k: {
    id: "plays_1k",
    label: "1,000 Plays",
    description: "Drive 1,000 targeted plays to your track",
    priceUsd: 10,
    boostPoints: 5,
    durationDays: 7,
  },
  trending: {
    id: "trending",
    label: "Trending Boost",
    description: "Feature your track in the Trending section for 3 days",
    priceUsd: 25,
    boostPoints: 15,
    durationDays: 3,
  },
  city_spotlight: {
    id: "city_spotlight",
    label: "City Spotlight",
    description: "Premium city map billboard placement for 7 days",
    priceUsd: 75,
    boostPoints: 40,
    durationDays: 7,
  },
} as const;

export type BoostPackageId = keyof typeof BOOST_PACKAGES;
