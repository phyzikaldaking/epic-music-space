import { Queue } from "bullmq";
import { getRedis } from "./redis";
const connection = getRedis();
// ─────────────────────────────────────────────────────────
// Queue definitions
// ─────────────────────────────────────────────────────────
/** Only instantiate queues when Redis is available */
function makeQueue(name) {
    if (!connection)
        return null;
    return new Queue(name, {
        connection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
        },
    });
}
export const aiScoringQueue = makeQueue("ems:ai-scoring");
export const notificationQueue = makeQueue("ems:notifications");
export const analyticsQueue = makeQueue("ems:analytics");
// ─────────────────────────────────────────────────────────
// Typed job enqueue helpers
// ─────────────────────────────────────────────────────────
export async function enqueueAiScoring(songId) {
    if (!aiScoringQueue)
        return;
    await aiScoringQueue.add("score-song", { songId }, { jobId: `ai:${songId}` });
}
export async function enqueueNotification(data) {
    if (!notificationQueue)
        return;
    await notificationQueue.add("send-notification", data);
}
export async function enqueueAnalytics(data) {
    if (!analyticsQueue)
        return;
    await analyticsQueue.add("track", data);
}
