import { NextRequest, NextResponse } from "next/server";
import { strictLimiter } from "@/lib/rateLimit";
import { track } from "@/lib/analytics";
import type { FunnelEventName } from "@/lib/funnelEvents";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

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

  const body = await req.json().catch(() => ({}));
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

  track({
    event,
    properties: {
      role,
      ip,
      source,
      ...(properties ?? {}),
    },
  });

  return NextResponse.json({ ok: true });
}
