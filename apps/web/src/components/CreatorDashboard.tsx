"use client";

import { demoCreatorSnapshot, calculateCreatorAnalytics, generateCreatorInsights } from "@/lib/creatorInsights";

const INSIGHT_ICONS: Record<string, string> = {
  momentum: "🚀",
  engagement: "🔥",
  retention: "🎯",
  viral: "⚡",
  default: "💡",
};

export default function CreatorDashboard() {
  const analytics = calculateCreatorAnalytics(demoCreatorSnapshot);
  const insights = generateCreatorInsights(demoCreatorSnapshot);

  const metrics = [
    { label: "Momentum", value: analytics.creatorMomentum, accent: "text-brand-400" },
    { label: "Engagement", value: analytics.engagementRate, suffix: "%", accent: "text-accent-400" },
    { label: "Completion", value: analytics.completionSignal, suffix: "%", accent: "text-green-400" },
    { label: "Skip Rate", value: analytics.skipRate, suffix: "%", accent: "text-yellow-400" },
    { label: "Click Intent", value: analytics.clickIntentRate, suffix: "%", accent: "text-blue-400" },
    { label: "Share Rate", value: analytics.shareRate, suffix: "%", accent: "text-pink-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight mb-1">
          Creator <span className="text-gradient-ems">Intelligence</span>
        </h2>
        <p className="text-sm text-white/40">Real-time signals from your audience activity</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="glass-card rounded-2xl p-4 flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">
              {m.label}
            </p>
            <p className={`text-2xl font-black ${m.accent}`}>
              {m.value}{m.suffix ?? ""}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-base font-bold text-white/70 mb-3">Why You&apos;re Trending</h3>
        <div className="space-y-2.5">
          {insights.map((insight, i) => {
            const icon = INSIGHT_ICONS[insight.type?.toLowerCase()] ?? INSIGHT_ICONS.default;
            return (
              <div key={i} className="glass-card rounded-2xl p-4 flex gap-3 card-hover-neon">
                <span className="text-2xl flex-shrink-0">{icon}</span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">
                    {insight.type}
                  </p>
                  <p className="font-bold text-sm">{insight.title}</p>
                  <p className="text-xs text-white/50 mt-0.5">{insight.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
