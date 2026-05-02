import { NextRequest, NextResponse } from "next/server";
import { strictLimiter } from "@/lib/rateLimit";
import { track } from "@/lib/analytics";

const allowedEvents = new Set([
  "funnel_visitor_to_signup_view",
  "funnel_signup_role_selected",
]);

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

  if (!allowedEvents.has(event)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  track({
    event,
    properties: {
      role,
      ip,
      source: "web_signup",
    },
  });

  return NextResponse.json({ ok: true });
}
