import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

// User-facing feedback intake. The submit is intentionally cheap —
// just inserts the row and returns. The LLM extraction (sentiment,
// feature tag, summary) runs out of band in the
// /api/cron/feedback-extract job so a slow OpenAI call never blocks
// the user's submit.

const schema = z.object({
  body: z.string().min(2).max(4000),
  pagePath: z.string().max(200).optional(),
  channel: z.enum(["chat", "inline-survey", "post-record", "post-purchase"]).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Soft rate-limit: per-IP + per-user. The widget doesn't auto-fire,
  // but we still want to catch a stuck textarea spamming submit.
  try {
    await moderateLimiter.consume(`feedback:ip:${ip}`);
    if (session?.user?.id) {
      await moderateLimiter.consume(`feedback:user:${session.user.id}`);
    }
  } catch {
    return NextResponse.json(
      { error: "Too many feedback submissions — slow down a bit." },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as unknown;
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const entry = await prisma.feedbackEntry.create({
    data: {
      userId: session?.user?.id ?? null,
      body: parsed.data.body.trim().slice(0, 4000),
      pagePath: parsed.data.pagePath ?? null,
      channel: parsed.data.channel ?? "chat",
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
}
