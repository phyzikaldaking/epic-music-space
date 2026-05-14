import { NextResponse } from "next/server";
import { createCollabInvite } from "@/lib/collabInvites";
import { collabPermissionSchema, roomIdSchema } from "@/lib/collabSecurity";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  roomId: roomIdSchema.optional(),
  role: z.enum(["HOST", "PRODUCER", "ENGINEER", "ARTIST", "GUEST"]).default("GUEST"),
  permission: collabPermissionSchema.default("COMMENT"),
  ttlMinutes: z.number().int().min(5).max(10080).default(1440),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) {
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
  return NextResponse.json({
    token,
    roomId,
    role: body.role,
    permission: body.permission,
    expiresAt: new Date(Date.now() + body.ttlMinutes * 60_000).toISOString(),
    path: `/studio/collab?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(token)}`,
  });
}
