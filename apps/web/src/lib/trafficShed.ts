import type { Queue } from "bullmq";
import {
  aiScoringQueue,
  analyticsQueue,
  notificationQueue,
} from "@/lib/queues";

type QueuePressure = "normal" | "elevated" | "critical";

interface QueuePressureSnapshot {
  pressure: QueuePressure;
  backlog: number;
  failed: number;
  sampledAtMs: number;
}

let cachedSnapshot: QueuePressureSnapshot | null = null;

function parseIntWithDefault(value: string | undefined, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

const CACHE_MS = parseIntWithDefault(process.env.TRAFFIC_SHED_CACHE_MS, 5000);
const ELEVATED_BACKLOG = parseIntWithDefault(
  process.env.QUEUE_SHED_ELEVATED_BACKLOG,
  500,
);
const ELEVATED_FAILED = parseIntWithDefault(
  process.env.QUEUE_SHED_ELEVATED_FAILED,
  50,
);
const CRITICAL_BACKLOG = parseIntWithDefault(
  process.env.QUEUE_SHED_CRITICAL_BACKLOG,
  1200,
);
const CRITICAL_FAILED = parseIntWithDefault(
  process.env.QUEUE_SHED_CRITICAL_FAILED,
  120,
);

// Accept any concrete BullMQ Queue — invariance on the data type would
// otherwise reject the typed app queues here. We only call generic Queue
// methods (getJobCounts) so the inner type doesn't matter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getQueueCounts(q: Queue<any, any, string>) {
  const counts = await q.getJobCounts("wait", "active", "delayed", "failed");
  return {
    backlog: (counts.wait ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
    failed: counts.failed ?? 0,
  };
}

export async function getQueuePressureSnapshot(): Promise<QueuePressureSnapshot> {
  if (process.env.FORCE_DEGRADED_MODE === "1") {
    return {
      pressure: "critical",
      backlog: 0,
      failed: 0,
      sampledAtMs: Date.now(),
    };
  }

  const now = Date.now();
  if (cachedSnapshot && now - cachedSnapshot.sampledAtMs < CACHE_MS) {
    return cachedSnapshot;
  }

  // BullMQ's Queue<T> is invariant in T, so a Queue<unknown> predicate
  // doesn't accept the typed concrete queues. Use NonNullable<typeof q>
  // so each entry keeps its true type after filtering.
  const queues = [aiScoringQueue, notificationQueue, analyticsQueue].filter(
    (q): q is NonNullable<typeof q> => q !== null,
  );

  if (queues.length === 0) {
    cachedSnapshot = {
      pressure: "normal",
      backlog: 0,
      failed: 0,
      sampledAtMs: now,
    };
    return cachedSnapshot;
  }

  try {
    const counts = await Promise.all(queues.map((q) => getQueueCounts(q)));
    const backlog = counts.reduce((acc, c) => acc + c.backlog, 0);
    const failed = counts.reduce((acc, c) => acc + c.failed, 0);

    const pressure: QueuePressure =
      backlog >= CRITICAL_BACKLOG || failed >= CRITICAL_FAILED
        ? "critical"
        : backlog >= ELEVATED_BACKLOG || failed >= ELEVATED_FAILED
          ? "elevated"
          : "normal";

    cachedSnapshot = {
      pressure,
      backlog,
      failed,
      sampledAtMs: now,
    };
    return cachedSnapshot;
  } catch {
    // If queue telemetry fails, fail open instead of blocking traffic.
    cachedSnapshot = {
      pressure: "normal",
      backlog: 0,
      failed: 0,
      sampledAtMs: now,
    };
    return cachedSnapshot;
  }
}

export async function shouldShedNonCriticalWork() {
  const snapshot = await getQueuePressureSnapshot();
  return snapshot.pressure !== "normal";
}
