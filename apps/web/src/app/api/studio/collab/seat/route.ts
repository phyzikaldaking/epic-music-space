import { NextResponse } from "next/server";
import { patchCollabSeat } from "@/lib/collabBackend";
import { seatPatchSchema } from "@/lib/collabSecurity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const parsed = seatPatchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid seat patch", issues: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const state = await patchCollabSeat(body.roomId ?? "ems-main-room", body.seatId, {
    mic: body.mic,
    cam: body.cam,
    speaking: body.speaking,
    online: body.online,
    permission: body.permission,
  });
  return NextResponse.json(state);
}
