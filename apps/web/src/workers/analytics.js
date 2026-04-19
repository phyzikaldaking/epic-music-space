/**
 * Analytics Worker
 *
 * Consumes jobs from the `ems:analytics` BullMQ queue.
 * Currently logs events to stdout — replace with your analytics sink
 * (Mixpanel, PostHog, BigQuery, etc.) without touching queue producers.
 *
 * Run as a standalone Node.js process:
 *   `npx tsx src/workers/analytics.ts`
 */
import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
const connection = getRedis();
if (!connection) {
    console.error("[analytics-worker] REDIS_URL is not set — worker cannot start");
    process.exit(1);
}
const worker = new Worker("ems:analytics", async (job) => {
    const { event, userId, songId, metadata, timestamp } = job.data;
    // Structured log — pipe to your observability platform
    console.info(JSON.stringify({ event, userId, songId, metadata, timestamp }));
    // TODO: forward to PostHog / Mixpanel / BigQuery here
}, {
    connection,
    concurrency: 50,
});
worker.on("failed", (job, err) => {
    console.error(`[analytics-worker] Job failed: ${job === null || job === void 0 ? void 0 : job.id}`, err.message);
});
console.info("[analytics-worker] Started — listening for jobs on ems:analytics");
