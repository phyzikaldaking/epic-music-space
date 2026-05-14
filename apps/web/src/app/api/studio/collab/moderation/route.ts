import { NextResponse } from "next/server";
import { z } from "zod";
import { patchCollabSeat, updateCollabRoomState } from "@/lib/collabBackend";
import { roomIdSchema, seatIdSchema } from "@/lib/collabSecurity";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

const moderationSchema = z.object({
  roomId: roomIdSchema.optional(),
  seatId: seatIdSchema.optional(),
  action: z.enum(["mute", "camera_off", "make_viewer", "make_commenter", "make_editor", "kick", "lock_room", "unlock_room"]),
  reason: z.string().min(1).max(240).optional(),
});

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-moderation-write", 20, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many moderation actions" }, { status: 429, headers: collabRateLimitHeaders(limit) });

  const raw = await request.json().catch(() => ({}));
  const parsed = moderationSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid moderation action", issues: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const roomId = body.roomId ?? "ems-main-room";
  const reason = body.reason ?? "Host moderation action";

  if (body.action === "lock_room") {
    const state = await updateCollabRoomState(roomId, { locked: true }, "Room locked", reason);
    return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
  }

  if (body.action === "unlock_room") {
    const state = await updateCollabRoomState(roomId, { locked: false }, "Room unlocked", reason);
    return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
  }

  if (!body.seatId) {
    return NextResponse.json({ error: "seatId is required for this moderation action" }, { status: 400 });
  }

  const patch =
    body.action === "mute" ? { mic: false } :
    body.action === "camera_off" ? { cam: false } :
    body.action === "make_viewer" ? { permission: "VIEW" as const, mic: false, cam: false } :
    body.action === "make_commenter" ? { permission: "COMMENT" as const } :
    body.action === "make_editor" ? { permission: "EDIT" as const } :
    body.action === "kick" ? { online: false, mic: false, cam: false, permission: "VIEW" as const } :
    {};

  const state = await patchCollabSeat(roomId, body.seatId, patch);
  return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
}
