import { NextResponse } from "next/server";
import { scoreClipVirality, generateClipCoachSuggestions, buildOptimizedCaption } from "@/lib/clipCoach";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const score = scoreClipVirality(body);
  const suggestions = generateClipCoachSuggestions(body);
  const optimizedCaption = buildOptimizedCaption(body);

  return NextResponse.json({
    score,
    suggestions,
    optimizedCaption,
  });
}
