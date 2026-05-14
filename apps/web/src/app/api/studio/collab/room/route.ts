import { NextResponse } from "next/server";
import { getCollabRoomState, updateCollabRoomState } from "@/lib/collabBackend";

export const dynamic = "force-dynamic";

type RoomPatch = {
  roomId?: string;
  locked?: boolean;
  recordApproval?: boolean;
  exportApproval?: boolean;
  screenShare?: boolean;
  markerCount?: number;
  title?: string;
  detail?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") ?? "ems-main-room";
  const state = await getCollabRoomState(roomId);
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RoomPatch;
  const roomId = body.roomId ?? "ems-main-room";
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
  return NextResponse.json(state);
}
