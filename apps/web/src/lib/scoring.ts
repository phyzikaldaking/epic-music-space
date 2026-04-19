/**
 * EMS AI Score Engine
 *
 * Composite popularity/quality score used for marketplace ranking and
 * district elevation. Scores range 0–100.
 *
 * Formula:
 *   score = (licenseSales * 0.35) + (engagement * 0.25) +
 *           (versusWins * 0.20) + (aiSentiment * 0.10) + (recency * 0.10)
 *
 * NOTE: This is an algorithmic popularity metric only — it does not
 * represent any financial value, guarantee of returns, or investment advice.
 */

export interface ScoreInputs {
  soldLicenses: number;
  totalLicenses: number;
  streamCount: number;
  versusWins: number;
  versusLosses: number;
  aiSentiment: number;   // 0–1 from OpenAI analysis
  boostScore: number;    // 0–100 from paid boost packages
  createdAt: Date;
}

/** Normalize a value to 0–100 with a soft cap */
function normalize(value: number, softMax: number): number {
  return Math.min(100, (value / softMax) * 100);
}

/** Days since creation, decaying toward 0 over 365 days */
function recencyScore(createdAt: Date): number {
  const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - (daysSince / 365) * 100);
}

export function calculateAiScore(inputs: ScoreInputs): number {
  const {
    soldLicenses,
    totalLicenses,
    streamCount,
    versusWins,
    versusLosses,
    aiSentiment,
    boostScore,
    createdAt,
  } = inputs;

  // Sales component: how much of the license allocation has sold
  const salesPct = totalLicenses > 0 ? (soldLicenses / totalLicenses) * 100 : 0;

  // Engagement: streams (soft cap at 10,000)
  const engagement = normalize(streamCount, 10_000);

  // Versus wins (soft cap at 50 wins)
  const totalVersus = versusWins + versusLosses;
  const versusScore =
    totalVersus > 0 ? normalize((versusWins / totalVersus) * 100, 100) : 0;

  // AI sentiment (0–1 → 0–100)
  const sentiment = Math.min(100, aiSentiment * 100);

  const recency = recencyScore(createdAt);

  // Boost component: paid visibility boost, capped at 100
  const boost = Math.min(100, Math.max(0, boostScore));

  const score =
    salesPct * 0.30 +
    engagement * 0.20 +
    versusScore * 0.15 +
    sentiment * 0.10 +
    recency * 0.10 +
    boost * 0.15;

  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/** Determine district based on score */
export function scoreToDistrict(
  score: number
): "INDIE_BLOCKS" | "DOWNTOWN_PRIME" | "LABEL_ROW" {
  if (score >= 80) return "LABEL_ROW";
  if (score >= 50) return "DOWNTOWN_PRIME";
  return "INDIE_BLOCKS";
}

/** District display metadata */
export const DISTRICT_META = {
  INDIE_BLOCKS: {
    label: "Indie Blocks",
    color: "text-white/60",
    bg: "bg-white/10",
    description: "General discovery tier",
    visibilityMultiplier: 1,
  },
  DOWNTOWN_PRIME: {
    label: "Downtown Prime",
    color: "text-brand-400",
    bg: "bg-brand-500/20",
    description: "High-visibility placement",
    visibilityMultiplier: 2,
  },
  LABEL_ROW: {
    label: "Label Row",
    color: "text-accent-400",
    bg: "bg-accent-500/20",
    description: "Elite — top performers only",
    visibilityMultiplier: 4,
  },
} as const;
