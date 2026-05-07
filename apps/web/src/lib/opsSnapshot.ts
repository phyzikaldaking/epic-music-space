import type { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  aiScoringQueue,
  analyticsQueue,
  analyticsDeadLetterQueue,
  notificationQueue,
} from "@/lib/queues";
import { getCriticalEnvironmentHealthReport } from "@/lib/criticalEnv";

export interface QueueSnapshot {
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
    const counts = await q.getJobCounts("wait", "active", "completed", "failed", "delayed");
    return { name, ok: true, ...counts };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pingDb() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pingRedis() {
  const redis = getRedis();
  if (!redis) return { configured: false as const, required: process.env.VERCEL_ENV === "production" };
  const startedAt = Date.now();
  try {
    await redis.ping();
    return {
      configured: true as const,
      required: process.env.VERCEL_ENV === "production",
      ok: true,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      configured: true as const,
      required: process.env.VERCEL_ENV === "production",
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function getQueues() {
  if (!aiScoringQueue || !notificationQueue || !analyticsQueue) return null;
   const results = await Promise.all([
     snapshotQueue("ai-scoring", aiScoringQueue as unknown as Queue<unknown>),
     snapshotQueue("notifications", notificationQueue as unknown as Queue<unknown>),
     snapshotQueue("analytics", analyticsQueue as unknown as Queue<unknown>),
     analyticsDeadLetterQueue
       ? snapshotQueue("analytics-dead-letter", analyticsDeadLetterQueue as unknown as Queue<unknown>)
       : null,
   ]);
  return results.filter((r): r is QueueSnapshot => r !== null);
}

export async function getOpsSnapshot() {
  const now = Date.now();
  const since5m = new Date(now - 5 * 60 * 1000);
  const since24h = new Date(now - 24 * 60 * 60 * 1000);

  const [
    db,
    redis,
    queues,
    environment,
    registrations24h,
    songs24h,
    posts24h,
    transactions24h,
    failedTransactions24h,
    openReports,
    flaggedUsers,
    activeRooms,
    activeIncidents,
    plays5m,
  ] = await Promise.all([
    pingDb(),
    pingRedis(),
    getQueues(),
    Promise.resolve(getCriticalEnvironmentHealthReport()),
    prisma.user.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.song.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.post.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.transaction.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.transaction.count({ where: { createdAt: { gte: since24h }, status: "FAILED" } }).catch(() => -1),
    prisma.userReport.count({ where: { status: { in: ["PENDING", "REVIEWED"] } } }).catch(() => -1),
    prisma.user.count({ where: { OR: [{ flaggedAt: { not: null } }, { suspicionScore: { gte: 50 } }] } }).catch(() => -1),
    prisma.room.count({ where: { status: "LIVE" } }).catch(() => -1),
    prisma.statusIncident.count({ where: { resolvedAt: null } }).catch(() => -1),
    prisma.userBehaviorEvent.count({
      where: { createdAt: { gte: since5m }, eventType: { in: ["view", "view_track", "watch_75"] } },
    }).catch(() => -1),
  ]);

  const queueBacklog =
    queues?.reduce((total, queue) => total + (queue.waiting ?? 0) + (queue.active ?? 0) + (queue.delayed ?? 0), 0) ?? 0;
  const failedJobs = queues?.reduce((total, queue) => total + (queue.failed ?? 0), 0) ?? 0;
  const queuePressure =
    queueBacklog >= 1200 || failedJobs >= 120
      ? "critical"
      : queueBacklog >= 500 || failedJobs >= 50
        ? "elevated"
        : "normal";
  const failedPaymentRate =
    transactions24h > 0 && failedTransactions24h >= 0
      ? Math.round((failedTransactions24h / transactions24h) * 1000) / 10
      : 0;

  const readiness =
    !db.ok || (redis.required && (!redis.configured || !redis.ok)) || environment.status === "down"
      ? "down"
      : queueBacklog > 500 || failedJobs > 50 || failedPaymentRate >= 10 || openReports > 25
        ? "degraded"
        : "ok";

  return {
    timestamp: new Date().toISOString(),
    readiness,
    deploy: {
      commitShort: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "dev",
      region: process.env.VERCEL_REGION ?? "local",
    },
    db,
    redis,
    queues,
    environment,
    traffic: {
      plays5m,
      activeRooms,
      registrations24h,
      songs24h,
      posts24h,
    },
    money: {
      transactions24h,
      failedTransactions24h,
      failedPaymentRate,
    },
    trust: {
      openReports,
      flaggedUsers,
      activeIncidents,
    },
    pressure: {
      queue: queuePressure,
      queueAlert: queuePressure !== "normal",
    },
    queueBacklog,
    failedJobs,
  };
}
