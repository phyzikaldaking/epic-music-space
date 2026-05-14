import { NextResponse } from "next/server";
import { patchCollabSeat, type CollabPermission } from "@/lib/collabBackend";

export const dynamic = "force-dynamic";

type SeatPatch = {
  roomId?: string;
  seatId?: string;
  mic?: boolean;
  cam?: boolean;
  speaking?: boolean;
  online?: boolean;
  permission?: CollabPermission;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SeatPatch;
  if (!body.seatId) {
    return NextResponse.json({ error: "Missing seatId" }, { status: 400 });
  }
  const state = await patchCollabSeat(body.roomId ?? "ems-main-room", body.seatId, {
    mic: body.mic,
    cam: body.cam,
    speaking: body.speaking,
    online: body.online,
    permission: body.permission,
  });
  return NextResponse.json(state);
}
