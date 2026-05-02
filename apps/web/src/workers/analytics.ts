import { Worker } from "bullmq";
import { PostHog } from "posthog-node";
import { getRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queueNames";
import type { AnalyticsJobData } from "../lib/queues";

const connection = getRedis();

if (!connection) {
  console.error("[analytics-worker] REDIS_URL is not set — worker cannot start");
  process.exit(1);
}

let posthog: PostHog | null = null;
if (process.env.POSTHOG_API_KEY) {
  posthog = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 20,
    flushInterval: 10_000,
  });
  console.info("[analytics-worker] PostHog sink active");
} else {
  console.warn("[analytics-worker] POSTHOG_API_KEY not set — logging to stdout only");
}

const worker = new Worker<AnalyticsJobData>(
  QUEUE_NAMES.analytics,
  async (job) => {
    const { event, userId, songId, metadata, timestamp } = job.data;

    if (posthog && userId) {
      posthog.capture({
        distinctId: userId,
        event,
        properties: { songId, ...metadata, timestamp },
      });
    } else {
      console.info(JSON.stringify({ event, userId, songId, metadata, timestamp }));
    }
  },
  { connection, concurrency: 50 },
);

worker.on("failed", (job, err) => {
  console.error(`[analytics-worker] Job failed: ${job?.id}`, err.message);
});

process.on("SIGTERM", async () => {
  await posthog?.shutdown();
  await worker.close();
  process.exit(0);
});

console.info(`[analytics-worker] Started listening on ${QUEUE_NAMES.analytics}`);
