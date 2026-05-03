"use client";

import { demoCreatorSnapshot, calculateCreatorAnalytics, generateCreatorInsights } from "@/lib/creatorInsights";

export default function CreatorDashboard() {
  const analytics = calculateCreatorAnalytics(demoCreatorSnapshot);
  const insights = generateCreatorInsights(demoCreatorSnapshot);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-black mb-6">Creator Intelligence</h1>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Metric label="Momentum" value={analytics.creatorMomentum} />
        <Metric label="Engagement %" value={analytics.engagementRate} />
        <Metric label="Completion %" value={analytics.completionSignal} />
        <Metric label="Skip %" value={analytics.skipRate} />
        <Metric label="Click Intent %" value={analytics.clickIntentRate} />
        <Metric label="Share %" value={analytics.shareRate} />
      </div>

      <h2 className="text-2xl font-bold mb-3">Why You’re Trending</h2>

      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <p className="text-xs uppercase text-white/40">{insight.type}</p>
            <h3 className="font-bold text-lg">{insight.title}</h3>
            <p className="text-sm text-white/60">{insight.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
      <p className="text-xs text-white/40 uppercase">{label}</p>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}
