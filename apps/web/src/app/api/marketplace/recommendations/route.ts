import { NextResponse } from "next/server";
import { scoreRecommendation } from "@/lib/studioProductionSystems";

export const dynamic = "force-dynamic";

const demoItems = [
  { id: "beat-pack-prime", title: "Prime Beat Pack", plays: 1200, likes: 220, purchases: 31, recency: 90, trust: 95 },
  { id: "mix-engineer-elite", title: "Elite Mix Engineer", plays: 740, likes: 180, purchases: 45, recency: 75, trust: 98 },
  { id: "melody-kit-atl", title: "ATL Melody Kit", plays: 940, likes: 160, purchases: 24, recency: 88, trust: 91 },
];

export async function GET() {
  const recommendations = demoItems
    .map((item) => ({ ...item, score: scoreRecommendation(item) }))
    .sort((a, b) => b.score - a.score);
  return NextResponse.json({ recommendations, formula: "plays, likes, purchases, recency, and trust weighted ranking" });
}
