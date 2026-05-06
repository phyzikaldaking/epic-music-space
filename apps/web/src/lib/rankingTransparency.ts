const BOOST_HARD_CAP_POINTS = 24;
const BOOST_MAX_SHARE_OF_FINAL = 0.22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, softMax: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return clamp((value / softMax) * 100, 0, 100);
}

function recencyScore(createdAt: Date): number {
  const ageDays = Math.max(0, (Date.now() - createdAt.getTime()) / 86_400_000);
  return clamp(100 - (ageDays / 365) * 100, 0, 100);
}

export interface RankingTransparencyInput {
  aiScore: number;
  boostScore: number;
  soldLicenses: number;
  totalLicenses: number;
  streamCount: number;
  versusWins: number;
  versusLosses: number;
  createdAt: Date;
}

export interface RankingTransparencyResult {
  finalScore: number;
  organicScore: number;
  paidRequested: number;
  paidApplied: number;
  paidCap: number;
  paidInfluencePct: number;
  paidBoostCapped: boolean;
  factors: {
    aiQuality: number;
    licenseDemand: number;
    streamVelocity: number;
    versusStrength: number;
    recency: number;
  };
}

export function computeRankingTransparency(
  input: RankingTransparencyInput,
): RankingTransparencyResult {
  const aiQuality = clamp(input.aiScore, 0, 100);
  const licenseDemand =
    input.totalLicenses > 0
      ? clamp((input.soldLicenses / input.totalLicenses) * 100, 0, 100)
      : 0;
  const streamVelocity = normalize(input.streamCount, 12_000);
  const versusTotal = Math.max(0, input.versusWins) + Math.max(0, input.versusLosses);
  const versusStrength =
    versusTotal > 0
      ? clamp((Math.max(0, input.versusWins) / versusTotal) * 100, 0, 100)
      : 0;
  const recency = recencyScore(input.createdAt);

  // Organic signals dominate: paid placement can help, but cannot overtake
  // market quality by itself.
  const organicScore =
    aiQuality * 0.64 +
    licenseDemand * 0.16 +
    streamVelocity * 0.1 +
    versusStrength * 0.06 +
    recency * 0.04;

  const paidRequested = Math.max(0, input.boostScore);
  const paidCap = Math.min(
    BOOST_HARD_CAP_POINTS,
    Math.max(6, organicScore * BOOST_MAX_SHARE_OF_FINAL),
  );
  const paidApplied = clamp(paidRequested, 0, paidCap);
  const finalScore = organicScore + paidApplied;
  const paidInfluencePct = finalScore > 0 ? (paidApplied / finalScore) * 100 : 0;

  return {
    finalScore: Number(finalScore.toFixed(2)),
    organicScore: Number(organicScore.toFixed(2)),
    paidRequested: Number(paidRequested.toFixed(2)),
    paidApplied: Number(paidApplied.toFixed(2)),
    paidCap: Number(paidCap.toFixed(2)),
    paidInfluencePct: Number(paidInfluencePct.toFixed(2)),
    paidBoostCapped: paidRequested > paidApplied,
    factors: {
      aiQuality: Number(aiQuality.toFixed(2)),
      licenseDemand: Number(licenseDemand.toFixed(2)),
      streamVelocity: Number(streamVelocity.toFixed(2)),
      versusStrength: Number(versusStrength.toFixed(2)),
      recency: Number(recency.toFixed(2)),
    },
  };
}
