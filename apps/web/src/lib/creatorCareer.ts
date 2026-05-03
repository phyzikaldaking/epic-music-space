export type CareerStats = {
  lifetimeEarnings: number;
  monthlyEarnings: number;
  totalViews: number;
  totalClips: number;
  viralClips: number;
  crownWins: number;
  followers: number;
  completionRate: number;
  shareRate: number;
};

export type CareerLevel = {
  level: number;
  title: string;
  minXp: number;
  perks: string[];
};

export type CareerMilestone = {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: string;
  completed: boolean;
};

export type CareerQuest = {
  id: string;
  title: string;
  description: string;
  type: "daily" | "weekly" | "career";
  progress: number;
  target: number;
  xpReward: number;
  completed: boolean;
};

export const careerLevels: CareerLevel[] = [
  { level: 1, title: "Bedroom Creator", minXp: 0, perks: ["Basic uploads", "Clip coach access"] },
  { level: 2, title: "Studio Rookie", minXp: 500, perks: ["Viral feed eligibility", "Basic analytics"] },
  { level: 3, title: "Rising Producer", minXp: 1500, perks: ["Boost recommendations", "Career quests"] },
  { level: 4, title: "Viral Contender", minXp: 3500, perks: ["Priority clip scoring", "Season leaderboard visibility"] },
  { level: 5, title: "Crown Challenger", minXp: 7500, perks: ["Premium placement discounts", "Finals eligibility"] },
  { level: 6, title: "EMS Champion", minXp: 15000, perks: ["Champion badge", "Featured creator placement"] },
  { level: 7, title: "Label-Level Operator", minXp: 30000, perks: ["Advanced revenue forecasting", "Team growth tools"] },
  { level: 8, title: "Platform Star", minXp: 60000, perks: ["Elite marketplace placement", "Season sponsor eligibility"] },
];

export function calculateCreatorXp(stats: CareerStats) {
  return Math.round(
    stats.lifetimeEarnings * 8 +
      stats.monthlyEarnings * 4 +
      stats.totalViews * 0.015 +
      stats.totalClips * 25 +
      stats.viralClips * 220 +
      stats.crownWins * 650 +
      stats.followers * 2 +
      stats.completionRate * 35 +
      stats.shareRate * 75,
  );
}

export function getCreatorLevel(xp: number) {
  return [...careerLevels].reverse().find((level) => xp >= level.minXp) ?? careerLevels[0];
}

export function getNextCreatorLevel(xp: number) {
  return careerLevels.find((level) => level.minXp > xp) ?? null;
}

export function getLevelProgress(xp: number) {
  const current = getCreatorLevel(xp);
  const next = getNextCreatorLevel(xp);
  if (!next) return 100;
  const span = next.minXp - current.minXp;
  return Math.round(((xp - current.minXp) / span) * 100);
}

export function buildCareerMilestones(stats: CareerStats): CareerMilestone[] {
  const milestones: CareerMilestone[] = [
    {
      id: "earn-100",
      title: "First $100 Earned",
      description: "Prove your content can convert attention into money.",
      progress: stats.lifetimeEarnings,
      target: 100,
      reward: "+250 XP + Rookie Earner badge",
      completed: stats.lifetimeEarnings >= 100,
    },
    {
      id: "earn-1000",
      title: "$1K Creator",
      description: "Reach your first serious creator income milestone.",
      progress: stats.lifetimeEarnings,
      target: 1000,
      reward: "+1,000 XP + Monetized Creator badge",
      completed: stats.lifetimeEarnings >= 1000,
    },
    {
      id: "views-100k",
      title: "100K Views",
      description: "Build enough attention to become algorithmically meaningful.",
      progress: stats.totalViews,
      target: 100000,
      reward: "+750 XP + Viral Reach badge",
      completed: stats.totalViews >= 100000,
    },
    {
      id: "clips-25",
      title: "25 Optimized Clips",
      description: "Create enough clip volume for the For You system to learn your lane.",
      progress: stats.totalClips,
      target: 25,
      reward: "+500 XP + Consistency badge",
      completed: stats.totalClips >= 25,
    },
    {
      id: "crown-5",
      title: "5 Crown Wins",
      description: "Prove you can win public attention battles repeatedly.",
      progress: stats.crownWins,
      target: 5,
      reward: "+2,500 XP + Crown Veteran badge",
      completed: stats.crownWins >= 5,
    },
  ];

  return milestones;
}

export function buildCareerQuests(stats: CareerStats): CareerQuest[] {
  return [
    {
      id: "daily-coach",
      title: "Run AI Coach on 1 Clip",
      description: "Improve one upload before publishing.",
      type: "daily",
      progress: Math.min(stats.totalClips, 1),
      target: 1,
      xpReward: 80,
      completed: stats.totalClips >= 1,
    },
    {
      id: "weekly-clips",
      title: "Publish 3 Viral-Ready Clips",
      description: "Feed the algorithm enough signals this week.",
      type: "weekly",
      progress: Math.min(stats.totalClips, 3),
      target: 3,
      xpReward: 300,
      completed: stats.totalClips >= 3,
    },
    {
      id: "weekly-share-rate",
      title: "Reach 8% Share Rate",
      description: "Create moments viewers want to send to someone else.",
      type: "weekly",
      progress: Math.min(stats.shareRate, 8),
      target: 8,
      xpReward: 450,
      completed: stats.shareRate >= 8,
    },
    {
      id: "career-income-target",
      title: "Hit $1K Monthly Run Rate",
      description: "Turn attention into repeatable creator income.",
      type: "career",
      progress: stats.monthlyEarnings,
      target: 1000,
      xpReward: 1500,
      completed: stats.monthlyEarnings >= 1000,
    },
  ];
}

export function calculateIncomeTarget(stats: CareerStats) {
  const current = stats.monthlyEarnings;
  const nextTarget = current < 100 ? 100 : current < 500 ? 500 : current < 1000 ? 1000 : current < 2500 ? 2500 : current < 5000 ? 5000 : 10000;
  return {
    current,
    target: nextTarget,
    progress: Math.min(100, Math.round((current / nextTarget) * 100)),
    gap: Math.max(0, Math.round((nextTarget - current) * 100) / 100),
  };
}

export function generateCareerAdvice(stats: CareerStats) {
  const advice: string[] = [];
  const incomeTarget = calculateIncomeTarget(stats);
  if (stats.totalClips < 25) advice.push("Increase optimized clip volume. The platform needs more attempts to identify your winning pattern.");
  if (stats.shareRate < 8) advice.push("Build clips around stronger social triggers: crown wins, outbid alerts, shock reactions, and fast beat drops.");
  if (stats.completionRate < 45) advice.push("Improve retention by cutting intros and starting the clip at the exact payoff moment.");
  if (incomeTarget.gap > 0) advice.push(`You are $${incomeTarget.gap} away from the next monthly income tier. Push your top viral clip with boost only after it proves engagement.`);
  if (stats.crownWins > 0) advice.push("Use crown wins in your profile and captions. Social proof compounds faster than generic promo.");
  return advice.length ? advice : ["Maintain your current pace and reinvest only into clips with strong completion and share signals."];
}

export const demoCareerStats: CareerStats = {
  lifetimeEarnings: 2840.5,
  monthlyEarnings: 940.75,
  totalViews: 384200,
  totalClips: 42,
  viralClips: 9,
  crownWins: 3,
  followers: 1280,
  completionRate: 46,
  shareRate: 8,
};
