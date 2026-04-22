import { Queue } from "bullmq";
import { getRedis } from "./redis";
import { QUEUE_NAMES } from "./queueNames";

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

export const aiScoringQueue = makeQueue<AiScoringJobData>(
  QUEUE_NAMES.aiScoring,
);
export const notificationQueue = makeQueue<NotificationJobData>(
  QUEUE_NAMES.notifications,
);
export const analyticsQueue = makeQueue<AnalyticsJobData>(
  QUEUE_NAMES.analytics,
);

// ---------------------------------------------------------
// Typed job enqueue helpers
// ---------------------------------------------------------

export async function enqueueAiScoring(songId: string) {
  if (!aiScoringQueue) return;
  await aiScoringQueue.add("score-song", { songId }, { jobId: `ai:${songId}` });
}

export async function enqueueNotification(data: NotificationJobData) {
  if (!notificationQueue) return;
  await notificationQueue.add("send-notification", data);
}

export async function enqueueAnalytics(data: AnalyticsJobData) {
  if (!analyticsQueue) return;
  await analyticsQueue.add("track", data);
}
