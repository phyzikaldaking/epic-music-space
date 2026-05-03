export type CreatorMetricSnapshot = {
  artistId?: string;
  artist: string;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  totalSkips: number;
  watch75Count: number;
  trackClicks: number;
  boostScore: number;
  viralScore: number;
  crownWins?: number;
  clipsCreated?: number;
};

export type CreatorInsight = {
  type: "strength" | "warning" | "opportunity" | "action";
  title: string;
  body: string;
  priority: number;
};

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function calculateCreatorAnalytics(snapshot: CreatorMetricSnapshot) {
  const engagementActions = snapshot.totalLikes + snapshot.totalShares + snapshot.totalComments + snapshot.trackClicks;
  const engagementRate = pct(engagementActions, snapshot.totalViews);
  const completionSignal = pct(snapshot.watch75Count, snapshot.totalViews);
  const skipRate = pct(snapshot.totalSkips, snapshot.totalViews);
  const clickIntentRate = pct(snapshot.trackClicks, snapshot.totalViews);
  const shareRate = pct(snapshot.totalShares, snapshot.totalViews);
  const creatorMomentum = Math.round(
    snapshot.viralScore * 0.35 +
      engagementRate * 1.2 +
      completionSignal * 1.4 +
      shareRate * 2.5 +
      clickIntentRate * 2 +
      snapshot.boostScore * 0.15 -
      skipRate * 1.1,
  );

  return {
    engagementRate,
    completionSignal,
    skipRate,
    clickIntentRate,
    shareRate,
    creatorMomentum: Math.max(0, creatorMomentum),
  };
}

export function generateCreatorInsights(snapshot: CreatorMetricSnapshot): CreatorInsight[] {
  const analytics = calculateCreatorAnalytics(snapshot);
  const insights: CreatorInsight[] = [];

  if (analytics.completionSignal >= 45) {
    insights.push({
      type: "strength",
      title: "Strong watch-time signal",
      body: `${analytics.completionSignal}% of viewers are staying deep into your clips. The algorithm should keep testing your content with more users.`,
      priority: 95,
    });
  }

  if (analytics.shareRate >= 8) {
    insights.push({
      type: "strength",
      title: "Your clips are shareable",
      body: `${analytics.shareRate}% share rate means your moments have outside-platform potential. Push more clips with direct conflict, crown shifts, and crowd reaction hooks.`,
      priority: 90,
    });
  }

  if (analytics.skipRate >= 35) {
    insights.push({
      type: "warning",
      title: "Opening seconds need more impact",
      body: `${analytics.skipRate}% skip rate is high. Start clips closer to the beat drop, crown shift, tip moment, or reaction spike.`,
      priority: 88,
    });
  }

  if (analytics.clickIntentRate >= 5) {
    insights.push({
      type: "strength",
      title: "Viewers are converting into track interest",
      body: `${analytics.clickIntentRate}% of viewers are clicking into your track. Add stronger licensing CTA and pin this clip in your profile.`,
      priority: 86,
    });
  }

  if (snapshot.boostScore > 0 && analytics.engagementRate < 5) {
    insights.push({
      type: "warning",
      title: "Boost spend needs better creative",
      body: "Your boost is creating visibility, but engagement is weak. Improve the clip hook before buying more paid placement.",
      priority: 82,
    });
  }

  if (snapshot.clipsCreated != null && snapshot.clipsCreated < 3) {
    insights.push({
      type: "opportunity",
      title: "You need more clip volume",
      body: "The feed needs more moments to learn from. Generate at least 5 clips: one beat drop, one crowd reaction, one live tip, one crown push, and one artist story clip.",
      priority: 78,
    });
  }

  if (snapshot.crownWins && snapshot.crownWins > 0) {
    insights.push({
      type: "action",
      title: "Use crown history as social proof",
      body: `You have ${snapshot.crownWins} crown win${snapshot.crownWins === 1 ? "" : "s"}. Put “Crown Winner” in your clip caption and profile headline.`,
      priority: 76,
    });
  }

  if (insights.length === 0) {
    insights.push({
      type: "action",
      title: "Create a stronger first signal",
      body: "Your data is still early. Focus on one high-energy clip and one clear CTA: listen, license, or tip.",
      priority: 50,
    });
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

export const demoCreatorSnapshot: CreatorMetricSnapshot = {
  artist: "Crown Holder",
  totalViews: 18420,
  totalLikes: 1480,
  totalShares: 312,
  totalComments: 226,
  totalSkips: 2920,
  watch75Count: 8420,
  trackClicks: 1140,
  boostScore: 240,
  viralScore: 96,
  crownWins: 3,
  clipsCreated: 8,
};
