/**
 * Notifications BullMQ worker
 *
 * A long-lived process that drains the `ems-notifications` queue. Each job
 * is a NotificationJobData payload identical to what enqueueNotification()
 * pushes — we re-use the same Prisma + email layer, so behavior here
 * matches the inline fallback in lib/queues.ts (which fires when Redis
 * isn't configured).
 *
 * Deployment: this is NOT a Vercel Function — Vercel doesn't run long-lived
 * processes. Run it on Railway / Render / Fly / a small Docker host with:
 *
 *   npm --workspace apps/web run worker:notifications
 *
 * Env: same as the web app (DATABASE_URL, REDIS_URL or UPSTASH_REDIS_*,
 * RESEND_API_KEY).
 *
 * If you don't run this worker the platform still functions: enqueueNotification
 * falls through to a direct prisma.notification.create() so in-app rows are
 * never lost. The worker just makes that path concurrent + retried.
 */
import { Worker } from "bullmq";
import { getRedis } from "../src/lib/redis";
import { QUEUE_NAMES } from "../src/lib/queueNames";
import { prisma } from "../src/lib/prisma";
import type { Prisma } from "@ems/db";

interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  email?: { subject: string; html: string; text?: string };
}

async function processJob(data: NotificationJob) {
  // Pref check happens at enqueue time, not here, to avoid drifting
  // semantics between the inline + queued paths.
  await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });

  if (data.email) {
    try {
      const { sendNotificationEmail } = await import("../src/lib/email");
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { email: true, emailVerified: true },
      });
      if (user?.email && user.emailVerified) {
        await sendNotificationEmail({
          to: user.email,
          subject: data.email.subject,
          html: data.email.html,
          text: data.email.text,
        });
      }
    } catch (err) {
      console.warn("[notifications-worker] email send failed", err);
    }
  }
}

async function main() {
  const connection = getRedis();
  if (!connection) {
    console.error("[notifications-worker] Redis not configured — exiting");
    process.exit(1);
  }

  const worker = new Worker<NotificationJob>(
    QUEUE_NAMES.notifications,
    async (job) => {
      await processJob(job.data);
    },
    {
      connection,
      concurrency: Number(process.env.NOTIFICATIONS_CONCURRENCY ?? 10),
    },
  );

  worker.on("ready", () => {
    console.log("[notifications-worker] ready, draining ems-notifications");
  });
  worker.on("completed", (job) => {
    console.log(`[notifications-worker] done id=${job.id} type=${job.data.type}`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[notifications-worker] failed id=${job?.id} err=${err.message}`);
  });

  // Graceful shutdown so in-flight jobs finish before exit.
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, async () => {
      console.log(`[notifications-worker] received ${sig}, closing…`);
      await worker.close();
      process.exit(0);
    });
  }
}

void main().catch((err) => {
  console.error("[notifications-worker] fatal", err);
  process.exit(1);
});
