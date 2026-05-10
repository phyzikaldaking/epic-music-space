import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

type FunnelRow = { event?: unknown; users?: unknown };

function toSafeInt(value: unknown): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

async function queryPostHog(days: number) {
  const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;

  if (!apiKey || !projectId) {
    return {
      ok: false as const,
      error:
        "PostHog query credentials are not configured. Set POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID.",
    };
  }

  const events = [
    "funnel_signup_completed",
    "funnel_artist_upload_view",
    "funnel_artist_upload_audio_selected",
    "funnel_artist_upload_audio_completed",
    "funnel_artist_upload_submit_attempt",
    "funnel_artist_upload_publish_completed",
    "funnel_artist_signup_to_first_upload",
  ] as const;

  const query = `
    SELECT
      event,
      uniq(distinct_id) AS users
    FROM events
    WHERE event IN (${events.map((e) => `'${e}'`).join(",")})
      AND timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY event
    ORDER BY users DESC
  `;

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    return {
      ok: false as const,
      error: `PostHog query failed (${res.status})`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as { results?: FunnelRow[] };
  return { ok: true as const, rows: data.results ?? [] };
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));

  const response = await queryPostHog(days);
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: response.error }, { status: 503 });
  }

  const counts: Record<string, number> = {};
  for (const row of response.rows) {
    const event = String(row.event ?? "");
    counts[event] = toSafeInt(row.users);
  }

  const signups = counts.funnel_signup_completed ?? 0;
  const firstUpload = counts.funnel_artist_signup_to_first_upload ?? 0;
  const publishCompleted = counts.funnel_artist_upload_publish_completed ?? 0;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

  const steps = [
    { event: "funnel_signup_completed", label: "Signup completed", users: signups },
    { event: "funnel_artist_upload_view", label: "Upload view", users: counts.funnel_artist_upload_view ?? 0 },
    { event: "funnel_artist_upload_audio_selected", label: "Audio selected", users: counts.funnel_artist_upload_audio_selected ?? 0 },
    { event: "funnel_artist_upload_audio_completed", label: "Audio completed", users: counts.funnel_artist_upload_audio_completed ?? 0 },
    { event: "funnel_artist_upload_submit_attempt", label: "Submit attempt", users: counts.funnel_artist_upload_submit_attempt ?? 0 },
    { event: "funnel_artist_upload_publish_completed", label: "Publish completed", users: publishCompleted },
  ];

  // Identify the biggest adjacent-step drop (heuristic: lowest step-to-previous ratio).
  let biggestDrop: { from: string; to: string; ratioPct: number } | null = null;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    const ratioPct = pct(cur.users, prev.users);
    if (!biggestDrop || ratioPct < biggestDrop.ratioPct) {
      biggestDrop = { from: prev.event, to: cur.event, ratioPct };
    }
  }

  return NextResponse.json({
    ok: true,
    windowDays: days,
    conversion: {
      from: "funnel_signup_completed",
      to: "funnel_artist_signup_to_first_upload",
      numerator: firstUpload,
      denominator: signups,
      pct: pct(firstUpload, signups),
    },
    publishConversion: {
      from: "funnel_signup_completed",
      to: "funnel_artist_upload_publish_completed",
      numerator: publishCompleted,
      denominator: signups,
      pct: pct(publishCompleted, signups),
    },
    steps,
    biggestDrop,
  });
}

