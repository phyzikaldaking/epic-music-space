import { NextResponse } from "next/server";
import { getCollabRoomState, updateCollabRoomState } from "@/lib/collabBackend";
import { roomIdSchema, roomPatchSchema } from "@/lib/collabSecurity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedRoomId = roomIdSchema.safeParse(url.searchParams.get("roomId") ?? "ems-main-room");
  if (!parsedRoomId.success) return NextResponse.json({ error: "Invalid roomId" }, { status: 400 });
  const state = await getCollabRoomState(parsedRoomId.data);
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const parsed = roomPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid room patch", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const state = await updateCollabRoomState(
    body.roomId ?? "ems-main-room",
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
  return NextResponse.json(state);
}
