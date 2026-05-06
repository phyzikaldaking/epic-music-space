import { Queue } from "bullmq";
import { getRedis } from "./redis";
import { QUEUE_NAMES } from "./queueNames";
import { prisma } from "./prisma";
import type { Prisma } from "@ems/db";
import { retry } from "./resilience";
import { outboxMessageId } from "./emailOutbox";

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
  // Optional companion email. When present and the user hasn't opted out
  // of the email channel for this type, we send it via the existing
  // notification email transport. Falls through silently if email isn't
  // configured (resend key missing) or the user opted out.
  email?: {
    subject: string;
    html: string;
    text?: string;
  };
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
  // Honor the recipient's per-channel opt-out. Missing pref rows default
  // to enabled (opt-out, not opt-in). If the lookup itself fails we
  // deliver anyway — better noisy than silently dropped.
  let inAppAllowed = true;
  let emailAllowed = true;
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: data.userId, type: data.type } },
      select: { inApp: true, email: true },
    });
    if (pref) {
      inAppAllowed = pref.inApp !== false;
      emailAllowed = pref.email !== false;
    }
  } catch (err) {
    console.warn("[enqueueNotification] pref lookup failed", err);
  }

  // ── Email channel ───────────────────────────────────────────────────
  // Write to the outbox table FIRST (guaranteed delivery), then attempt
  // the live send. The flush-email-outbox cron picks up any PENDING rows
  // that weren't confirmed sent within 5 minutes.
  if (emailAllowed && data.email) {
    void (async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: data.userId },
          select: { email: true, emailVerified: true, emailBounced: true },
        });
        if (!user?.email || !user.emailVerified || user.emailBounced) return;

        const messageId = outboxMessageId(data.userId, data.type);

        // Upsert so repeated calls are idempotent
        const outboxRow = await prisma.emailOutbox.upsert({
          where: { messageId },
          create: {
            messageId,
            userId: data.userId,
            to: user.email,
            subject: data.email!.subject,
            html: data.email!.html,
            text: data.email?.text,
            status: "PENDING",
          },
          update: {}, // already exists → leave it alone
        });

        // Only attempt live send when the row is still PENDING (not SENT already)
        if (outboxRow.status !== "PENDING") return;

        const { sendNotificationEmail } = await import("@/lib/email");
        await sendNotificationEmail({
          to: user.email,
          subject: data.email!.subject,
          html: data.email!.html,
          text: data.email?.text,
        });

        await prisma.emailOutbox.update({
          where: { id: outboxRow.id },
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (err) {
        console.warn("[enqueueNotification] email send failed", err);
      }
    })();
  }

  // ── In-app channel ──────────────────────────────────────────────────
  if (!inAppAllowed) return;

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

  // ── Native push channel ────────────────────────────────────────────
  // Fan out to every PushToken row for this user (iOS APNs + Android FCM)
  // so the notification wakes their phone, not just their /notifications
  // tab. Best-effort: a missing config (no APNS_KEY_P8 / no FCM_SERVER_KEY)
  // returns silently from sendPushToUsers and never throws.
  void (async () => {
    try {
      const { sendPushToUsers } = await import("@/lib/pushNotifications");
      await sendPushToUsers([data.userId], {
        title: data.title,
        body: data.body,
        url: deepLinkForNotification(data.type, data.metadata),
        data: data.metadata
          ? Object.fromEntries(
              Object.entries(data.metadata)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => [k, String(v)]),
            )
          : undefined,
      });
    } catch (err) {
      console.warn("[enqueueNotification] push send failed", err);
    }
  })();
}

/**
 * Map a notification type to the deep-link the app should open when the
 * user taps the push. Falls back to the in-app /notifications tab so a
 * tap is never a dead end.
 */
function deepLinkForNotification(type: string, meta?: Record<string, unknown>): string {
  const matchId = typeof meta?.matchId === "string" ? meta.matchId : null;
  const battleId = typeof meta?.battleId === "string" ? meta.battleId : null;
  const songId = typeof meta?.songId === "string" ? meta.songId : null;
  const conversationId = typeof meta?.conversationId === "string" ? meta.conversationId : null;
  const postId = typeof meta?.postId === "string" ? meta.postId : null;
  const challengeId = typeof meta?.challengeId === "string" ? meta.challengeId : null;

  if (type.startsWith("VERSUS")) {
    if (challengeId) return `/versus/inbox?id=${challengeId}`;
    if (matchId) return `/versus/${matchId}`;
    if (battleId) return `/versus/royale/${battleId}`;
    return "/versus";
  }
  if (type.startsWith("VERZUZ")) {
    if (challengeId) return `/versus/inbox?type=verzuz&id=${challengeId}`;
    if (matchId) return `/verzuz/${matchId}`;
    return "/verzuz";
  }
  if (type === "DM" && conversationId) return `/messages/${conversationId}`;
  if (type === "POST_LIKED" || type === "POST_COMMENTED" || type === "FOLLOWED_POST") {
    return postId ? `/timeline?post=${postId}` : "/timeline";
  }
  if (type.includes("LICENSE") && songId) return `/song/${songId}`;
  if (type.includes("PAYOUT") || type.includes("CONNECT") || type.includes("PAYMENT")) {
    return "/dashboard/earnings";
  }
  if (type.includes("SUBSCRIPTION")) return "/dashboard/subscriptions";
  if (type.includes("BADGE")) return "/dashboard/badges";
  if (type.includes("FOLLOW")) return "/timeline";
  if (type.includes("AUCTION_BID")) return "/auctions";
  if (type === "ROOM_LIVE" && matchId) return `/rooms/${matchId}`;
  return "/notifications";
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
