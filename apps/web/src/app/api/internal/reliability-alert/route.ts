import { NextRequest, NextResponse } from "next/server";
import { strictLimiter } from "@/lib/rateLimit";
import { track } from "@/lib/analytics";

type ReliabilityAlertPayload = {
  service?: string;
  event?: string;
  severity?: "info" | "warning" | "critical";
  ts?: string;
  meta?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(`reliability-alert:${ip}`);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as ReliabilityAlertPayload;

  if (!body.event) {
    return NextResponse.json({ ok: false, error: "missing_event" }, { status: 400 });
  }

  const payload = {
    source: body.service ?? "epic-music-space/web",
    severity: body.severity ?? "warning",
    timestamp: body.ts ?? new Date().toISOString(),
    event: body.event,
    ip,
    ...(body.meta ?? {}),
  };

  if (payload.severity === "critical" || payload.severity === "warning") {
    console.error("[reliability-alert]", payload);
  } else {
    console.log("[reliability-alert]", payload);
  }

  track({
    event: "reliability_alert_received",
    properties: payload,
  });

  return NextResponse.json({ ok: true });
}
