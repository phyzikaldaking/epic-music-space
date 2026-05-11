import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { openai, openaiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily rollup: look at the last 7 days of extracted feedback,
// cluster by feature tag + sentiment, ask the LLM to write a 1-line
// theme + recommendation for each cluster, save as AiInsight rows.
// The admin dashboard surfaces these on /admin/ai.
//
// Clusters are simple keyword groups for v1 — we can swap to actual
// embedding-based clustering once we cross ~10k entries / week.

const SYSTEM_PROMPT = `You are the platform-intelligence brain for Epic Music Space.
You will be given a CLUSTER of recent user feedback rows sharing a feature tag and sentiment.
Write a single concise insight as strict JSON, no prose:

{
  "title":          1-line theme headline (max 140 chars),
  "body":           2-3 sentence summary of what users are saying,
  "confidence":     0.0..1.0 — your confidence the theme is real,
  "recommendation": 1-2 sentence suggested platform action (or empty string if none obvious)
}

Output ONLY the JSON object.`;

interface ClusterInsight {
  title: string;
  body: string;
  confidence: number;
  recommendation: string;
}

async function llmInsight(rows: Array<{ summary: string | null; body: string }>): Promise<ClusterInsight | null> {
  if (!openai || !openaiConfigured) return null;
  const lines = rows.slice(0, 30).map((r, i) => `${i + 1}. ${r.summary ?? r.body.slice(0, 280)}`).join("\n");
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as Partial<ClusterInsight>;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }
    return {
      title: parsed.title.slice(0, 200),
      body: parsed.body.slice(0, 2000),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation.slice(0, 1000) : "",
    };
  } catch (err) {
    console.warn("[feedback-rollup] llm call failed", err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (cronGate) return cronGate;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const entries = await prisma.feedbackEntry.findMany({
    where: {
      extractedAt: { not: null },
      sentiment: { not: null },
      feature: { not: null },
      createdAt: { gte: since },
    },
    select: { id: true, summary: true, body: true, sentiment: true, feature: true },
    take: 1_000,
  });

  // Cluster: group by `${feature}|${sentiment}`.
  const groups = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.feature || !e.sentiment) continue;
    const key = `${e.feature}|${e.sentiment}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  let created = 0;
  // Only write insights for clusters with at least 3 rows — a single
  // complaint isn't a theme yet.
  for (const [key, rows] of groups.entries()) {
    if (rows.length < 3) continue;
    const insight = await llmInsight(rows);
    if (!insight) continue;
    await prisma.aiInsight.create({
      data: {
        kind: "feedback-theme",
        title: `${key} — ${insight.title}`,
        body: insight.body,
        confidence: insight.confidence,
        evidenceIds: rows.map((r) => r.id),
        recommendation: insight.recommendation || null,
      },
    });
    created++;
  }

  return NextResponse.json({
    ok: true,
    entriesInWindow: entries.length,
    clustersFound: groups.size,
    insightsCreated: created,
  });
}
