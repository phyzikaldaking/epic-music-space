import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const SUPPORTED_EVENTS = {
  heroAssignment: "funnel_home_hero_variant_assigned",
  ctaCopyAssignment: "funnel_home_cta_copy_variant_assigned",
  splitClick: "funnel_home_split_cta_click",
  signupCompleted: "funnel_signup_completed",
} as const;

interface PostHogQueryResponse {
  results?: Array<Record<string, unknown>>;
}

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

  const query = `
    SELECT
      event,
      coalesce(toString(properties.variant), '(none)') AS variant,
      coalesce(toString(properties.role), '(none)') AS role,
      coalesce(toString(properties.placement), '(none)') AS placement,
      count() AS ct
    FROM events
    WHERE event IN ('${SUPPORTED_EVENTS.heroAssignment}','${SUPPORTED_EVENTS.ctaCopyAssignment}','${SUPPORTED_EVENTS.splitClick}','${SUPPORTED_EVENTS.signupCompleted}')
      AND timestamp >= now() - INTERVAL ${days} DAY
    GROUP BY event, variant, role, placement
    ORDER BY event, ct DESC
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

  const data = (await res.json().catch(() => ({}))) as PostHogQueryResponse;
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
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 14)));

  const response = await queryPostHog(days);
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: response.error,
      },
      { status: 503 },
    );
  }

  const heroVariants: Record<string, number> = {};
  const ctaVariants: Record<string, number> = {};
  const splitClicksByRolePlacement: Record<string, number> = {};
  const signupCompletedByRole: Record<string, number> = {};

  for (const row of response.rows) {
    const event = String(row.event ?? "");
    const variant = String(row.variant ?? "(none)");
    const role = String(row.role ?? "(none)");
    const placement = String(row.placement ?? "(none)");
    const count = toSafeInt(row.ct);

    if (event === SUPPORTED_EVENTS.heroAssignment) {
      heroVariants[variant] = (heroVariants[variant] ?? 0) + count;
      continue;
    }

    if (event === SUPPORTED_EVENTS.ctaCopyAssignment) {
      ctaVariants[variant] = (ctaVariants[variant] ?? 0) + count;
      continue;
    }

    if (event === SUPPORTED_EVENTS.splitClick) {
      const key = `${role}:${placement}`;
      splitClicksByRolePlacement[key] = (splitClicksByRolePlacement[key] ?? 0) + count;
      continue;
    }

    if (event === SUPPORTED_EVENTS.signupCompleted) {
      signupCompletedByRole[role] = (signupCompletedByRole[role] ?? 0) + count;
    }
  }

  return NextResponse.json({
    ok: true,
    windowDays: days,
    experiments: {
      heroHeadline: {
        event: SUPPORTED_EVENTS.heroAssignment,
        variants: heroVariants,
      },
      splitCtaCopy: {
        event: SUPPORTED_EVENTS.ctaCopyAssignment,
        variants: ctaVariants,
      },
    },
    funnel: {
      splitCtaClicks: {
        event: SUPPORTED_EVENTS.splitClick,
        byRolePlacement: splitClicksByRolePlacement,
      },
      signupCompleted: {
        event: SUPPORTED_EVENTS.signupCompleted,
        byRole: signupCompletedByRole,
      },
    },
  });
}
