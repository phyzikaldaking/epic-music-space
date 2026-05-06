import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

// GET /api/rooms/[id]/ping
//
// Cheap heartbeat used by the room client's connection-quality loop:
// it measures the round-trip time and labels the connection good/fair/poor
// from the client side. The handler stays minimal on purpose — auth gate
// + lenient rate limit + small JSON, so the RTT we measure is dominated by
// network rather than server work.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("lenient", `room:ping:${session.user.id}:${id}`);
  if (blocked) return blocked;

  return NextResponse.json(
    { ok: true, t: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
