import { NextResponse } from "next/server";
import { getCollabRoomState, updateCollabRoomState } from "@/lib/collabBackend";
import { getCollabAuthority, roomIdSchema, roomPatchSchema } from "@/lib/collabSecurity";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-room-read", 90, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many room reads" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const url = new URL(request.url);
  const parsedRoomId = roomIdSchema.safeParse(url.searchParams.get("roomId") ?? "ems-main-room");
  if (!parsedRoomId.success) return NextResponse.json({ error: "Invalid roomId" }, { status: 400 });
  const state = await getCollabRoomState(parsedRoomId.data);
  return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
}

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-room-write", 30, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many room updates" }, { status: 429, headers: collabRateLimitHeaders(limit) });
  const raw = await request.json().catch(() => ({}));
  const parsed = roomPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid room patch", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const roomId = body.roomId ?? "ems-main-room";
  const authority = getCollabAuthority(request, roomId, body.invite);
  if (!authority.allowed || authority.permission !== "OWNER") {
    return NextResponse.json({ error: authority.reason ?? "Owner permission required" }, { status: 403, headers: collabRateLimitHeaders(limit) });
  }
  const state = await updateCollabRoomState(
    roomId,
    {
      locked: body.locked,
      recordApproval: body.recordApproval,
      exportApproval: body.exportApproval,
      screenShare: body.screenShare,
      markerCount: body.markerCount,
    },
    body.title ?? "Room updated",
    body.detail ?? "Collab room state changed",
  );
  return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
}
