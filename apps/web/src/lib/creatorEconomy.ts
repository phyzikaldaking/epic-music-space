export type CreatorEconomyPoint = {
  date: string;
  earnings: number;
  views: number;
  clips: number;
};

export type CreatorRevenueInput = {
  lifetimeEarnings: number;
  last30DayEarnings: number;
  totalViews: number;
  totalClips: number;
  avgRevenuePerView?: number;
  avgRevenuePerClip?: number;
  momentumScore: number;
  engagementRate: number;
  shareRate: number;
  completionRate: number;
  history: CreatorEconomyPoint[];
};

export function calculateGrowthRate(history: CreatorEconomyPoint[]) {
  if (history.length < 2) return 0;
  const midpoint = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, midpoint).reduce((sum, point) => sum + point.earnings, 0);
  const secondHalf = history.slice(midpoint).reduce((sum, point) => sum + point.earnings, 0);
  if (firstHalf <= 0) return secondHalf > 0 ? 100 : 0;
  return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
}

export function calculateRevenueEfficiency(input: CreatorRevenueInput) {
  const rpm = input.totalViews > 0 ? (input.lifetimeEarnings / input.totalViews) * 1000 : 0;
  const revenuePerClip = input.totalClips > 0 ? input.lifetimeEarnings / input.totalClips : 0;
  const conversionStrength = Math.round(input.engagementRate * 0.45 + input.shareRate * 1.2 + input.completionRate * 0.65);
  return {
    rpm: Math.round(rpm * 100) / 100,
    revenuePerClip: Math.round(revenuePerClip * 100) / 100,
    conversionStrength,
  };
}

export function forecastCreatorRevenue(input: CreatorRevenueInput) {
  const growthRate = calculateGrowthRate(input.history);
  const efficiency = calculateRevenueEfficiency(input);
  const baseMonthly = Math.max(input.last30DayEarnings, input.lifetimeEarnings / 6, 0);
  const momentumMultiplier = 1 + Math.min(1.5, Math.max(0, input.momentumScore / 100));
  const growthMultiplier = 1 + Math.max(-0.35, Math.min(0.85, growthRate / 100));
  const qualityMultiplier = 1 + Math.min(0.75, efficiency.conversionStrength / 150);

  const next30 = baseMonthly * momentumMultiplier * growthMultiplier * qualityMultiplier;
  const next90 = next30 * 3 * (1 + Math.max(0, growthRate) / 250);
  const annualized = next30 * 12 * (1 + Math.max(0, growthRate) / 180);

  return {
    next30: Math.round(next30 * 100) / 100,
    next90: Math.round(next90 * 100) / 100,
    annualized: Math.round(annualized * 100) / 100,
    growthRate,
    confidence: Math.max(35, Math.min(95, Math.round(45 + input.history.length * 3 + input.momentumScore * 0.25))),
  };
}

export function predictClipRevenue(params: {
  viralScore: number;
  expectedViews?: number;
  shareRate?: number;
  completionRate?: number;
  monetizationStrength?: number;
}) {
  const expectedViews = params.expectedViews ?? Math.max(500, params.viralScore * 185);
  const rpm = 1.8 + params.viralScore / 18 + (params.shareRate ?? 5) / 10 + (params.completionRate ?? 35) / 25 + (params.monetizationStrength ?? 50) / 50;
  const predicted = (expectedViews / 1000) * rpm;
  return {
    expectedViews: Math.round(expectedViews),
    predictedRevenue: Math.round(predicted * 100) / 100,
    rpm: Math.round(rpm * 100) / 100,
  };
}

export function generateEconomyRecommendations(input: CreatorRevenueInput) {
  const forecast = forecastCreatorRevenue(input);
  const efficiency = calculateRevenueEfficiency(input);
  const recommendations: string[] = [];

  if (efficiency.rpm < 4) recommendations.push("Improve monetization per view by adding stronger track CTAs, tip prompts, and licensing links inside high-retention clips.");
  if (input.shareRate < 6) recommendations.push("Increase share rate by clipping more conflict moments: crown takeovers, outbid alerts, crowd shock, and last-second wins.");
  if (input.completionRate < 40) recommendations.push("Shorten clips and start closer to the payoff. Completion rate is the fastest way to raise feed distribution.");
  if (forecast.growthRate > 25) recommendations.push("You are in growth mode. Increase clip volume while momentum is hot, then boost only the top-scoring clips.");
  if (recommendations.length === 0) recommendations.push("Maintain consistency: publish 3–5 optimized clips weekly and reinvest earnings into your strongest performing track moments.");

  return recommendations;
}

export const demoEconomyInput: CreatorRevenueInput = {
  lifetimeEarnings: 2840.5,
  last30DayEarnings: 940.75,
  totalViews: 384200,
  totalClips: 42,
  momentumScore: 86,
  engagementRate: 14,
  shareRate: 8,
  completionRate: 46,
  history: [
    { date: "Week 1", earnings: 110, views: 18200, clips: 4 },
    { date: "Week 2", earnings: 180, views: 26100, clips: 5 },
    { date: "Week 3", earnings: 265, views: 39200, clips: 6 },
    { date: "Week 4", earnings: 385, views: 54200, clips: 7 },
    { date: "Week 5", earnings: 620, views: 84600, clips: 8 },
    { date: "Week 6", earnings: 940, views: 112300, clips: 9 },
  ],
};
