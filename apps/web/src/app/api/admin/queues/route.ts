import { NextResponse } from "next/server";
import type { Queue } from "bullmq";
import { auth } from "@/lib/auth";
import {
  aiScoringQueue,
  notificationQueue,
  analyticsQueue,
  analyticsDeadLetterQueue,
} from "@/lib/queues";

export const runtime = "nodejs";

/**
 * GET /api/admin/queues — admin-only queue health check.
 *
 * Returns counts (waiting / active / completed / failed / delayed) for
 * each BullMQ queue. Lets the host see at a glance whether workers are
 * draining their queues. When REDIS_URL is unset all queues are null
 * and the response signals that the deploy is in DB-fallback mode.
 *
 * Used by the admin dashboard + as a Render readiness probe.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!aiScoringQueue || !notificationQueue || !analyticsQueue) {
    return NextResponse.json({
      redisConfigured: false,
      message:
        "REDIS_URL is not set on this deploy — every enqueue path is using the synchronous DB-write fallback. Workers are not running.",
      queues: {},
    });
  }

  async function snapshot(name: string, q: Queue<unknown>) {
    try {
      const counts = await q.getJobCounts(
        "wait",
        "active",
        "completed",
        "failed",
        "delayed",
      );
      return {
        name,
        ok: true,
        ...counts,
      };
    } catch (err) {
      return {
        name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const [ai, notif, ana, dlq] = await Promise.all([
    snapshot("ai-scoring", aiScoringQueue as unknown as Queue<unknown>),
    snapshot("notifications", notificationQueue as unknown as Queue<unknown>),
    snapshot("analytics", analyticsQueue as unknown as Queue<unknown>),
    analyticsDeadLetterQueue
      ? snapshot("dead-letter", analyticsDeadLetterQueue as unknown as Queue<unknown>)
      : null,
  ]);

  return NextResponse.json({
    redisConfigured: true,
    queues: { aiScoring: ai, notifications: notif, analytics: ana, deadLetter: dlq },
  });
}
