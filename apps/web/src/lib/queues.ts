import { Queue } from "bullmq";
import { getRedis } from "./redis";
import { QUEUE_NAMES } from "./queueNames";
import { prisma } from "./prisma";
import type { Prisma } from "@ems/db";
import { retry } from "./resilience";

const connection = getRedis();

// ---------------------------------------------------------
// Queue definitions
// ---------------------------------------------------------

/** Only instantiate queues when Redis is available */
function makeQueue<T>(name: string) {
  if (!connection) return null;
  return new Queue<T>(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

// Queue: run AI scoring after a song is uploaded
export interface AiScoringJobData {
  songId: string;
}

// Queue: fan-out a notification to a user
export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// Queue: record analytics events
export interface AnalyticsJobData {
  event: string;
  userId?: string;
  songId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface DeadLetterJobData {
  queue: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export const aiScoringQueue = makeQueue<AiScoringJobData>(
  QUEUE_NAMES.aiScoring,
);
export const notificationQueue = makeQueue<NotificationJobData>(
  QUEUE_NAMES.notifications,
);
export const analyticsQueue = makeQueue<AnalyticsJobData>(
  QUEUE_NAMES.analytics,
);
export const deadLetterQueue = makeQueue<DeadLetterJobData>(
  `${QUEUE_NAMES.analytics}:dead-letter`,
);

async function enqueueWithRetry<T>(
  queueName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: Queue<any, any, string> | null,
  jobName: string,
  data: T,
) {
  if (!queue) return false;

  try {
    await retry(() => queue.add(jobName, data), { retries: 2, baseDelayMs: 400 });
    return true;
  } catch (error) {
    console.error(`[queue:${queueName}] enqueue failed`, error);

    if (deadLetterQueue) {
      await deadLetterQueue.add("dead-letter", {
        queue: queueName,
        reason: error instanceof Error ? error.message : "unknown",
        payload: data as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });
    }

    return false;
  }
}

// ---------------------------------------------------------
// Typed job enqueue helpers
// ---------------------------------------------------------

export async function enqueueAiScoring(songId: string) {
  await enqueueWithRetry(
    QUEUE_NAMES.aiScoring,
    aiScoringQueue,
    "score-song",
    { songId },
  );
}

export async function enqueueNotification(data: NotificationJobData) {
  const queued = await enqueueWithRetry(
    QUEUE_NAMES.notifications,
    notificationQueue,
    "send-notification",
    data,
  );

  if (queued) {
    return;
  }
  // No Redis — write directly to DB so notifications are never silently dropped
  try {
    await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[enqueueNotification] Direct DB write failed", err);
  }
}

export async function enqueueAnalytics(data: AnalyticsJobData) {
  const queued = await enqueueWithRetry(
    QUEUE_NAMES.analytics,
    analyticsQueue,
    "track",
    data,
  );

  if (queued) {
    return;
  }
  // No Redis — log so analytics events are not silently dropped
  console.info("[analytics]", JSON.stringify({ ...data, queued: false }));
}
