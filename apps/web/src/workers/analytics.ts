import { Worker } from "bullmq";
import { PostHog } from "posthog-node";
import { getBullMqRedis } from "../lib/redis";
import { QUEUE_NAMES } from "../lib/queueNames";
import type { AnalyticsJobData } from "../lib/queues";
import { logWorkerFailure, startWorkerHealthServer } from "./workerHealth";

function hasValidPostHogApiKey() {
  const apiKey = process.env.POSTHOG_API_KEY;
  return Boolean(apiKey && apiKey.startsWith("phc_"));
}

const connection = getBullMqRedis();

if (!connection) {
  console.error("[analytics-worker] REDIS_URL is not set — worker cannot start");
  process.exit(1);
}

const redisConnection = connection;
const readiness = { ready: false, detail: "connecting" };
const healthServer = startWorkerHealthServer("analytics", readiness, redisConnection);
let posthog: PostHog | null = null;
if (hasValidPostHogApiKey()) {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (apiKey && apiKey.startsWith("phc_")) {
    posthog = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  console.info("[analytics-worker] PostHog sink active");
} else {
  console.warn("[analytics-worker] POSTHOG_API_KEY is missing or invalid — logging to stdout only");
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
  { connection: redisConnection, concurrency: 50 },
);

worker.on("ready", () => { readiness.ready = true; readiness.detail = "redis and queue connection ready"; console.info(JSON.stringify({ event: "worker_ready", worker: "analytics" })); });
worker.on("failed", (job, err) => { logWorkerFailure("analytics", "worker_job_failed", err, { jobId: job?.id }); });
worker.on("error", (err) => { readiness.ready = false; readiness.detail = "worker error"; logWorkerFailure("analytics", "worker_error", err); });

async function shutdown(signal: string) {
  readiness.ready = false;
  readiness.detail = `shutting down (${signal})`;
  console.info(`[analytics-worker] Received ${signal}, draining…`);
  try {
    await posthog?.shutdown();
    await worker.close();
    healthServer.close();
    console.info("[analytics-worker] Closed cleanly");
    process.exit(0);
  } catch (err) {
    logWorkerFailure("analytics", "worker_shutdown_failed", err);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (err) => { logWorkerFailure("analytics", "worker_uncaught_exception", err); process.exit(1); });
process.on("unhandledRejection", (err) => { logWorkerFailure("analytics", "worker_unhandled_rejection", err); process.exit(1); });

console.info(`[analytics-worker] Started listening on ${QUEUE_NAMES.analytics}`);
