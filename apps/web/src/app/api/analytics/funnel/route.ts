import { NextRequest, NextResponse } from "next/server";
import { strictLimiter } from "@/lib/rateLimit";
import { track } from "@/lib/analytics";
import type { FunnelEventName } from "@/lib/funnelEvents";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { getQueuePressureSnapshot, shouldShedNonCriticalWork } from "@/lib/trafficShed";

const allowedEvents = new Set<FunnelEventName>(Object.values(FUNNEL_EVENTS));

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(`funnel:${ip}`);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const body = bodyResult.value;
  const event = typeof body.event === "string" ? body.event : "";
  const role = typeof body.role === "string" ? body.role : undefined;
  const source = typeof body.source === "string" ? body.source : undefined;
  const properties =
    body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
      ? (body.properties as Record<string, unknown>)
      : undefined;

  if (!allowedEvents.has(event as FunnelEventName)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (await shouldShedNonCriticalWork()) {
    const pressure = await getQueuePressureSnapshot();
    return NextResponse.json(
      {
        ok: true,
        degraded: true,
        reason: "queue_pressure",
        pressure: pressure.pressure,
      },
      { status: 202 },
    );
  }

  const tracked = await withRouteTimeout("funnel-track", 1200, async () => {
    track({
      event,
      properties: {
        role,
        ip,
        source,
        ...(properties ?? {}),
      },
    });
  });
  if (!tracked.ok) return tracked.response;

  return NextResponse.json({ ok: true });
}
