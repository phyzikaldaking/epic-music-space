/**
 * Notification Worker
 *
 * Consumes jobs from the notifications BullMQ queue and persists them
 * to the Notification table (which Supabase Realtime broadcasts to the
 * connected browser client).
 *
 * Run as a standalone Node.js process:
 *   `npx tsx src/workers/notifications.ts`
 */

import { Worker } from "bullmq";
import { getBullMqRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { QUEUE_NAMES } from "../lib/queueNames";
import type { NotificationJobData } from "../lib/queues";
import type { Prisma } from "@ems/db";

const connection = getBullMqRedis();

if (!connection) {
  console.error(
    "[notifications-worker] REDIS_URL is not set — worker cannot start",
  );
  process.exit(1);
}

const worker = new Worker<NotificationJobData>(
  QUEUE_NAMES.notifications,
  async (job) => {
    const { userId, type, title, body, metadata } = job.data;

    // Validate the user still exists before persisting
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn(
        `[notifications-worker] User not found: ${userId}; skipping`,
      );
      return;
    }

    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    console.info(
      `[notifications-worker] Notification created: user=${userId} type=${type}`,
    );
  },
  {
    connection,
    concurrency: 20,
  },
);

worker.on("completed", (job) => {
  console.info(`[notifications-worker] Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[notifications-worker] Job failed: ${job?.id}`, err.message);
});

worker.on("error", (err) => {
  console.error("[notifications-worker] Worker error", err);
});

// Graceful shutdown so Render's SIGTERM → SIGKILL grace window doesn't
// kill in-flight jobs mid-write. worker.close() drains active jobs,
// stops accepting new ones, and resolves once everything settles.
async function shutdown(signal: string) {
  console.info(`[notifications-worker] Received ${signal}, draining…`);
  try {
    await worker.close();
    console.info("[notifications-worker] Closed cleanly");
    process.exit(0);
  } catch (err) {
    console.error("[notifications-worker] Shutdown failed", err);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.info(
  `[notifications-worker] Started listening for jobs on ${QUEUE_NAMES.notifications}`,
);
