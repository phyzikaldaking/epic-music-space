import { NextResponse } from "next/server";
import { z } from "zod";
import { detectSpamSignal } from "@/lib/studioProductionSystems";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

const signalSchema = z.object({
  text: z.string().max(2000).optional(),
  linkCount: z.number().int().min(0).max(100).optional(),
  duplicateCount: z.number().int().min(0).max(100).optional(),
  reportCount: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "studio-moderation-signal", 60, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many moderation checks" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const raw = await request.json().catch(() => ({}));
  const parsed = signalSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid moderation payload", issues: parsed.error.flatten() }, { status: 400, headers: collabRateLimitHeaders(limit) });
  const signal = detectSpamSignal(parsed.data);
  return NextResponse.json({ flagged: Boolean(signal), signal }, { headers: collabRateLimitHeaders(limit) });
}

export async function GET() {
  return NextResponse.json({ openSignals: [], message: "Moderation dashboard API is ready for persisted review queues." });
}
