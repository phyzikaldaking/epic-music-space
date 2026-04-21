/**
 * Notification Worker
 *
 * Consumes jobs from the `ems:notifications` BullMQ queue and persists them
 * to the Notification table (which Supabase Realtime broadcasts to the
 * connected browser client).
 *
 * Run as a standalone Node.js process:
 *   `npx tsx src/workers/notifications.ts`
 */

import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import type { NotificationJobData } from "../lib/queues";
import type { Prisma } from "@ems/db";

const connection = getRedis();

if (!connection) {
  console.error(
    "[notifications-worker] REDIS_URL is not set — worker cannot start"
  );
  process.exit(1);
}

const worker = new Worker<NotificationJobData>(
  "ems:notifications",
  async (job) => {
    const { userId, type, title, body, metadata } = job.data;

    // Validate the user still exists before persisting
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.warn(`[notifications-worker] User not found: ${userId} — skipping`);
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
      `[notifications-worker] Notification created: user=${userId} type=${type}`
    );
  },
  {
    connection,
    concurrency: 20,
  }
);

worker.on("completed", (job) => {
  console.info(`[notifications-worker] Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `[notifications-worker] Job failed: ${job?.id}`,
    err.message
  );
});

console.info(
  "[notifications-worker] Started — listening for jobs on ems:notifications"
);
