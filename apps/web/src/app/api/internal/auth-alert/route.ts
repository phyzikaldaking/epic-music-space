import { NextRequest, NextResponse } from "next/server";
import { strictLimiter } from "@/lib/rateLimit";
import { track } from "@/lib/analytics";

type AuthAlertPayload = {
  service?: string;
  event?: string;
  severity?: string;
  ts?: string;
  meta?: Record<string, unknown>;
};

const allowedEvents = new Set([
  "verification_email_send_failed",
  "resend_email_send_failed",
]);

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(`auth-alert:${ip}`);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as AuthAlertPayload;

  if (!body.event || !allowedEvents.has(body.event)) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  const payload = {
    source: body.service ?? "epic-music-space/web",
    severity: body.severity ?? "warning",
    timestamp: body.ts ?? new Date().toISOString(),
    event: body.event,
    ip,
    ...body.meta,
  };

  console.error("[auth-alert:delivery]", payload);

  track({
    event: "auth_delivery_alert_received",
    properties: payload,
  });

  return NextResponse.json({ ok: true });
}
