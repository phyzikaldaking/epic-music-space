import { NextResponse } from "next/server";
import { patchCollabSeat } from "@/lib/collabBackend";
import { seatPatchSchema } from "@/lib/collabSecurity";
import { checkCollabRateLimit, collabRateLimitHeaders } from "@/lib/collabRateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = checkCollabRateLimit(request, "collab-seat-write", 45, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many seat updates" }, { status: 429, headers: collabRateLimitHeaders(limit) });
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
  return NextResponse.json(state, { headers: collabRateLimitHeaders(limit) });
}
