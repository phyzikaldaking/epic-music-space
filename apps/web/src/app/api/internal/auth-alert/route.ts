import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/authIdentity";
import { track } from "@/lib/analytics";

const authAlertPayloadSchema = z.object({
  service: z.string().trim().min(1).max(120).optional(),
  event: z.string().trim().min(1).max(120).optional(),
  severity: z.enum(["info", "warning", "error", "critical"]).optional(),
  ts: z.string().datetime().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const allowedEvents = new Set([
  "verification_email_send_failed",
  "resend_email_send_failed",
]);

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const ip = getClientIp(req.headers);

  try {
    await strictLimiter.consume(`auth-alert:${ip}`);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ ok: false, error: "invalid_content_type" }, { status: 415 });
  }

  const parsed = authAlertPayloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const body = parsed.data;

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
