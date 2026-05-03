"use client";

import { demoEconomyInput, forecastCreatorRevenue, calculateRevenueEfficiency, generateEconomyRecommendations, predictClipRevenue } from "@/lib/creatorEconomy";

export default function CreatorEconomyDashboard() {
  const forecast = forecastCreatorRevenue(demoEconomyInput);
  const efficiency = calculateRevenueEfficiency(demoEconomyInput);
  const recommendations = generateEconomyRecommendations(demoEconomyInput);
  const clipPrediction = predictClipRevenue({ viralScore: 88 });

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-4xl font-black mb-6">Creator Economy</h1>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Metric label="Lifetime Earnings" value={`$${demoEconomyInput.lifetimeEarnings}`} />
        <Metric label="Next 30 Days" value={`$${forecast.next30}`} />
        <Metric label="Annual Projection" value={`$${forecast.annualized}`} />
        <Metric label="RPM" value={`$${efficiency.rpm}`} />
        <Metric label="Revenue/Clip" value={`$${efficiency.revenuePerClip}`} />
        <Metric label="Growth Rate" value={`${forecast.growthRate}%`} />
      </div>

      <h2 className="text-2xl font-bold mb-3">AI Revenue Forecast</h2>
      <p className="text-white/70 mb-6">Confidence: {forecast.confidence}%</p>

      <h2 className="text-2xl font-bold mb-3">Clip Prediction</h2>
      <div className="bg-white/5 p-4 rounded mb-6">
        <p>Expected Views: {clipPrediction.expectedViews}</p>
        <p>Predicted Revenue: ${clipPrediction.predictedRevenue}</p>
        <p>RPM: ${clipPrediction.rpm}</p>
      </div>

      <h2 className="text-2xl font-bold mb-3">AI Recommendations</h2>
      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="bg-white/5 p-3 rounded">{rec}</li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 p-4 rounded">
      <p className="text-xs text-white/40 uppercase">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
