import { NextResponse } from "next/server";
import type { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  aiScoringQueue,
  notificationQueue,
  analyticsQueue,
  deadLetterQueue,
} from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/full — observability snapshot for the admin status
 * page and external uptime monitors.
 *
 * Auth: requires either a valid admin session OR a matching
 * `?token=` query param against HEALTH_FULL_TOKEN. The token form lets
 * UptimeRobot / BetterStack hit it without a cookie.
 *
 * Pulls deploy version, DB ping, Redis ping, queue depths, and a few
 * last-24h activity counts. Designed to be cheap (parallel reads, no
 * heavy aggregations).
 */

interface QueueSnapshot {
  name: string;
  ok: boolean;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  error?: string;
}

async function snapshotQueue(name: string, q: Queue<unknown>): Promise<QueueSnapshot> {
  try {
    const counts = await q.getJobCounts(
      "wait",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    return { name, ok: true, ...counts };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function authorize(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const expected = process.env.HEALTH_FULL_TOKEN;
  if (expected && token && token === expected) return true;

  const { auth } = await import("@/lib/auth");
  const session = await auth();
  return session?.user?.role === "ADMIN";
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();

  const dbPing = (async () => {
    const t0 = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const redisPing = (async () => {
    const redis = getRedis();
    if (!redis) return { configured: false };
    const t0 = Date.now();
    try {
      await redis.ping();
      return { configured: true, ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        configured: true,
        ok: false,
        latencyMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  const queueSnapshots = (async (): Promise<QueueSnapshot[] | null> => {
    if (!aiScoringQueue || !notificationQueue || !analyticsQueue) return null;
    const results = await Promise.all([
      snapshotQueue("ai-scoring", aiScoringQueue as unknown as Queue<unknown>),
      snapshotQueue("notifications", notificationQueue as unknown as Queue<unknown>),
      snapshotQueue("analytics", analyticsQueue as unknown as Queue<unknown>),
      deadLetterQueue
        ? snapshotQueue("dead-letter", deadLetterQueue as unknown as Queue<unknown>)
        : null,
    ]);
    return results.filter((r): r is QueueSnapshot => r !== null);
  })();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activity = (async () => {
    try {
      const [registrations24h, songs24h, totalUsers] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: since24h } } }),
        prisma.song.count({ where: { createdAt: { gte: since24h } } }),
        prisma.user.count(),
      ]);
      return { registrations24h, songs24h, totalUsers };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  })();

  const [db, redis, queues, recent] = await Promise.all([
    dbPing,
    redisPing,
    queueSnapshots,
    activity,
  ]);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    deploy: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      commitShort: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      region: process.env.VERCEL_REGION ?? null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    },
    db,
    redis,
    queues,
    activity: recent,
  });
}
