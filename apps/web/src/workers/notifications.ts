/** Notification worker with Railway liveness/readiness endpoints. */
import { Worker } from "bullmq";
import { getBullMqRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { QUEUE_NAMES } from "../lib/queueNames";
import type { NotificationJobData } from "../lib/queues";
import type { Prisma } from "@ems/db";
import { logWorkerFailure, startWorkerHealthServer } from "./workerHealth";
const connection = getBullMqRedis();
if (!connection) { console.error("[notifications-worker] REDIS_URL is not set — worker cannot start"); process.exit(1); }
const redisConnection = connection;
const readiness = {ready:false, detail:"connecting"};
const healthServer = startWorkerHealthServer("notifications", readiness, redisConnection);
const worker = new Worker<NotificationJobData>(QUEUE_NAMES.notifications, async (job) => {
  const {userId,type,title,body,metadata} = job.data;
  const user = await prisma.user.findUnique({where:{id:userId}});
  if (!user) { console.warn("[notifications-worker] User not found: " + userId + "; skipping"); return; }
  await prisma.notification.create({data:{userId,type,title,body,metadata:(metadata ?? {}) as Prisma.InputJsonValue}});
  console.info("[notifications-worker] Notification created: user=" + userId + " type=" + type);
}, {connection:redisConnection, concurrency:20});
worker.on("ready", () => { readiness.ready=true; readiness.detail="redis and queue connection ready"; console.info(JSON.stringify({event:"worker_ready",worker:"notifications"})); });
worker.on("completed", (job) => console.info("[notifications-worker] Job completed: " + job.id));
worker.on("failed", (job,err) => logWorkerFailure("notifications","worker_job_failed",err,{jobId:job?.id}));
worker.on("error", (err) => { readiness.ready=false; readiness.detail="worker error"; logWorkerFailure("notifications","worker_error",err); });
async function shutdown(signal:string) { readiness.ready=false; readiness.detail="shutting down (" + signal + ")"; console.info("[notifications-worker] Received " + signal + ", draining…"); try { await worker.close(); healthServer.close(); await redisConnection.quit(); console.info("[notifications-worker] Closed cleanly"); process.exit(0); } catch (err) { logWorkerFailure("notifications","worker_shutdown_failed",err); process.exit(1); } }
process.on("SIGTERM", () => void shutdown("SIGTERM")); process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("uncaughtException", (err) => { logWorkerFailure("notifications","worker_uncaught_exception",err); process.exit(1); });
process.on("unhandledRejection", (err) => { logWorkerFailure("notifications","worker_unhandled_rejection",err); process.exit(1); });
console.info("[notifications-worker] Started listening for jobs on " + QUEUE_NAMES.notifications);