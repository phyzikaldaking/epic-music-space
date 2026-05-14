import { NextResponse } from "next/server";
import { createCollabInvite } from "@/lib/collabInvites";
import { collabPermissionSchema, roomIdSchema } from "@/lib/collabSecurity";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";
import { trackCollabEvent } from "@/lib/collabTelemetry";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  roomId: roomIdSchema.optional(),
  role: z.enum(["HOST", "PRODUCER", "ENGINEER", "ARTIST", "GUEST"]).default("GUEST"),
  permission: collabPermissionSchema.default("COMMENT"),
  ttlMinutes: z.number().int().min(5).max(10080).default(1440),
});

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-invite-create", 12, 60_000);
  if (!limit.allowed) {
    trackCollabEvent({ event: "invite_rate_limited", level: "warn", scope: "collab-invite-create", status: 429 });
    return NextResponse.json({ error: "Too many invite requests" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) {
    trackCollabEvent({ event: "invite_invalid_request", level: "warn", status: 400 });
    return NextResponse.json({ error: "Invalid invite request", issues: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const roomId = body.roomId ?? "ems-main-room";
  const token = createCollabInvite({
    roomId,
    role: body.role,
    permission: body.permission,
    exp: Date.now() + body.ttlMinutes * 60_000,
  });
  trackCollabEvent({ event: "invite_created", roomId, role: body.role, permission: body.permission, metadata: { ttlMinutes: body.ttlMinutes } });
  return NextResponse.json({
    token,
    roomId,
    role: body.role,
    permission: body.permission,
    expiresAt: new Date(Date.now() + body.ttlMinutes * 60_000).toISOString(),
    path: `/studio/collab?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(token)}`,
  }, { headers: collabRateLimitHeaders(limit) });
}
