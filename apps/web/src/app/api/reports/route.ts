import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter } from "@/lib/rateLimit";

const reportSchema = z
  .object({
    reportedUserId: z.string().cuid().optional(),
    postId: z.string().cuid().optional(),
    reason: z.enum(["SPAM", "ABUSE", "IMPERSONATION", "NSFW", "OTHER"]),
    details: z.string().max(1000).optional(),
  })
  .refine((d) => !!d.reportedUserId || !!d.postId, {
    message: "reportedUserId or postId is required",
  });

/**
 * POST /api/reports — file a moderation report against a user or a post.
 * Returns: { ok: true }
 *
 * Strict rate limit per (reporter, target) pair so a malicious user can't
 * spam-report a victim into the admin queue.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { reportedUserId, postId, reason, details } = parsed.data;

  if (reportedUserId && reportedUserId === session.user.id) {
    return NextResponse.json(
      { error: "You can't report yourself." },
      { status: 400 },
    );
  }

  // Per-(reporter, target) limiter — one report every few minutes against
  // the same target. Stops dogpile-reporting one victim out of the feed.
  const targetKey = postId ?? reportedUserId ?? "x";
  try {
    await strictLimiter.consume(`report:${session.user.id}:${targetKey}`);
  } catch {
    return NextResponse.json(
      { error: "You've already reported this recently — moderators will review it." },
      { status: 429 },
    );
  }

  await prisma.userReport.create({
    data: {
      reporterId: session.user.id,
      reportedUserId: reportedUserId ?? null,
      postId: postId ?? null,
      reason,
      details: details ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
