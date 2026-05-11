import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { openai, openaiConfigured } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pulls every unprocessed FeedbackEntry, sends it through an LLM to
// extract structured fields (sentiment, feature, summary), then
// writes the result back. We process up to 40 rows per run so the
// 60s budget can comfortably handle the calls; a busier site can
// shorten the cron interval.

interface Extracted {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "BUG" | "FEATURE_REQUEST";
  feature: string;   // <= 60 chars
  summary: string;   // <= 280 chars
}

const SYSTEM_PROMPT = `You are the feedback intake brain for Epic Music Space, an in-browser DAW + rap marketplace.
A user just submitted a piece of feedback. Extract these fields as strict JSON, no prose:

{
  "sentiment": one of POSITIVE | NEUTRAL | NEGATIVE | BUG | FEATURE_REQUEST,
  "feature":   a short tag (one of: recording | beat-machine | mixing | mastering |
               plugin-host | live-rooms | rap-market | verses | account | pricing |
               mobile | other) — 60 chars max,
  "summary":   one short sentence (max 280 chars) capturing the actionable insight
}

Rules:
- If the user reports something broken use sentiment=BUG.
- If they ask for a new feature use sentiment=FEATURE_REQUEST.
- "feature" must be one of the listed tags; pick "other" if nothing fits.
- Output ONLY the JSON object, no markdown fences.`;

async function extractOne(body: string): Promise<Extracted | null> {
  if (!openai || !openaiConfigured) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: body.slice(0, 4000) },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as Partial<Extracted>;
    if (
      !parsed.sentiment ||
      !["POSITIVE", "NEUTRAL", "NEGATIVE", "BUG", "FEATURE_REQUEST"].includes(parsed.sentiment) ||
      typeof parsed.feature !== "string" ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }
    return {
      sentiment: parsed.sentiment,
      feature: parsed.feature.slice(0, 60),
      summary: parsed.summary.slice(0, 280),
    };
  } catch (err) {
    console.warn("[feedback-extract] llm call failed", err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const cronGate = requireCronRequest(req);
  if (!cronGate.ok) return cronGate.response;

  const pending = await prisma.feedbackEntry.findMany({
    where: { extractedAt: null },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  let processed = 0;
  let failed = 0;
  for (const entry of pending) {
    const extracted = await extractOne(entry.body);
    if (!extracted) {
      // Mark it processed anyway so we don't loop forever on a row
      // the LLM keeps choking on. The admin dashboard can still
      // surface entries with null sentiment for manual triage.
      await prisma.feedbackEntry.update({
        where: { id: entry.id },
        data: { extractedAt: new Date() },
      });
      failed++;
      continue;
    }
    await prisma.feedbackEntry.update({
      where: { id: entry.id },
      data: {
        sentiment: extracted.sentiment,
        feature: extracted.feature,
        summary: extracted.summary,
        extractedAt: new Date(),
      },
    });
    processed++;
  }

  return NextResponse.json({
    ok: true,
    pendingFound: pending.length,
    processed,
    failed,
  });
}
