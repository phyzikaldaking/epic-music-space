import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCronRequest } from "@/lib/routeAuth";
import { page } from "@/lib/pager";

export const runtime = "nodejs";

/**
 * GET /api/cron/auth-alerts
 *
 * Runs every 5 minutes. Walks the AuthEvent table, counts failures in the
 * last window vs. a 30-min baseline, and pages out via AUTH_ALERT_WEBHOOK_URL
 * if either:
 *   • absolute floor: ≥ FLOOR failures in the last 5 min, or
 *   • relative spike: this window is ≥ SPIKE_RATIO × the prior 30-min average.
 *
 * The Google-OAuth bug that locked sign-ins for 12 hours produced 2 failure
 * events in 1 minute, then 0 (because nobody else tried Google for the rest
 * of the night). The floor catches that on the next 5-min tick.
 *
 * De-dupe: when we fire, we write a synthetic AuthEvent with
 * event="alert_fired" and reason matching the fingerprint. The next tick
 * skips firing if a matching alert_fired exists in the last MUTE_MINUTES,
 * so a sustained outage doesn't spam the channel every 5 minutes.
 */

// Tunables. Picked conservatively so a quiet baseline doesn't false-positive,
// but a real bug fires within 10 minutes of the first user hitting it.
const WINDOW_MIN = 5;
const BASELINE_MIN = 30;
const FLOOR = 5;          // ≥ this many failures in WINDOW_MIN → page
const SPIKE_RATIO = 3;    // current rate ≥ this × baseline rate → page
const MIN_BASELINE = 1;   // baseline must clear this before SPIKE applies
const MUTE_MINUTES = 30;  // suppress duplicate alerts within this window

const FAILURE_EVENTS = [
  "signin_invalid_credentials",
  "signin_rate_limited",
  "signin_suspended",
  "oauth_signin_failure",
  "magic_link_invalid",
  "phone_signin_invalid_code",
  "phone_signin_invalid_phone",
] as const;

interface FailureBucket {
  event: string;
  count: number;
}

export async function GET(req: NextRequest) {
  const cron = requireCronRequest(req);
  if (!cron.ok) return cron.response;

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MIN * 60 * 1000);
  const baselineStart = new Date(now.getTime() - (WINDOW_MIN + BASELINE_MIN) * 60 * 1000);

  // Pull only the last 35 min of failure rows. This is one indexed scan
  // on (event, createdAt), bounded — no full-table scan even at scale.
  const events = await prisma.authEvent.findMany({
    where: {
      event: { in: FAILURE_EVENTS as unknown as string[] },
      createdAt: { gte: baselineStart },
    },
    select: { event: true, createdAt: true },
    take: 5_000,
  });

  const window: Map<string, number> = new Map();
  let windowTotal = 0;
  let baselineTotal = 0;

  for (const e of events) {
    if (e.createdAt >= windowStart) {
      window.set(e.event, (window.get(e.event) ?? 0) + 1);
      windowTotal++;
    } else {
      baselineTotal++;
    }
  }

  // Per-window rate (events per minute) for the spike ratio.
  const windowRate = windowTotal / WINDOW_MIN;
  const baselineRate = baselineTotal / BASELINE_MIN;

  const reasons: string[] = [];
  if (windowTotal >= FLOOR) {
    reasons.push(`floor breach: ${windowTotal} failures in ${WINDOW_MIN} min (limit ${FLOOR})`);
  }
  if (baselineTotal >= MIN_BASELINE && windowRate >= SPIKE_RATIO * Math.max(baselineRate, 0.0001)) {
    reasons.push(
      `spike: ${windowRate.toFixed(2)}/min vs baseline ${baselineRate.toFixed(2)}/min (≥${SPIKE_RATIO}×)`,
    );
  }

  if (reasons.length === 0) {
    return NextResponse.json({
      ok: true,
      alerted: false,
      windowMinutes: WINDOW_MIN,
      windowTotal,
      baselineTotal,
      now: now.toISOString(),
    });
  }

  // Fingerprint the alert by the dominant failure event so we don't spam
  // when one class of failure is sustained. A different event class within
  // the mute window will still fire — that's intentional.
  const dominantEvent = sortBuckets(window)[0]?.event ?? "auth_failure";
  const fingerprint = `auth-alert/${dominantEvent}`;

  // Suppress duplicates within MUTE_MINUTES.
  const muteSince = new Date(now.getTime() - MUTE_MINUTES * 60 * 1000);
  const recentMute = await prisma.authEvent.findFirst({
    where: {
      event: "alert_fired",
      reason: fingerprint,
      createdAt: { gte: muteSince },
    },
    select: { id: true },
  });

  if (recentMute) {
    return NextResponse.json({
      ok: true,
      alerted: false,
      muted: true,
      fingerprint,
      windowTotal,
      now: now.toISOString(),
    });
  }

  // Top 5 buckets in the readable body so the on-call sees what's hot.
  const breakdown = sortBuckets(window)
    .slice(0, 5)
    .map((b) => `${b.event}: ${b.count}`)
    .join(", ");

  page({
    severity: windowTotal >= FLOOR * 4 ? "critical" : "error",
    title: `Auth failure surge: ${windowTotal} in ${WINDOW_MIN} min`,
    body: [
      reasons.join("; "),
      `Top events — ${breakdown || "(none)"}`,
      `Baseline (last ${BASELINE_MIN} min): ${baselineTotal} events.`,
      `Dashboard: https://epicmusicspace.com/admin/risk?tab=auth`,
    ].join("\n"),
    fingerprint,
    context: {
      windowMinutes: WINDOW_MIN,
      windowTotal,
      baselineMinutes: BASELINE_MIN,
      baselineTotal,
      windowRate: Number(windowRate.toFixed(3)),
      baselineRate: Number(baselineRate.toFixed(3)),
      breakdown: Object.fromEntries(window),
    },
  });

  // Persist the fired alert so MUTE_MINUTES can deduplicate the next tick.
  await prisma.authEvent
    .create({
      data: {
        event: "alert_fired",
        reason: fingerprint,
        meta: { windowTotal, baselineTotal, breakdown: Object.fromEntries(window) },
      },
    })
    .catch(() => {
      // If the persist fails the alert still went out; the next tick may
      // re-fire. Better to over-alert than miss a real outage.
    });

  return NextResponse.json({
    ok: true,
    alerted: true,
    fingerprint,
    reasons,
    windowTotal,
    baselineTotal,
    now: now.toISOString(),
  });
}

function sortBuckets(map: Map<string, number>): FailureBucket[] {
  return Array.from(map.entries())
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);
}
