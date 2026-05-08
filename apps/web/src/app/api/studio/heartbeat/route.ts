import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

/** TTL (seconds) before a heartbeat key expires — slightly > the DawWorkspace ping interval (30 s) */
const HEARTBEAT_TTL_S = 45;
const KEY_PREFIX = "studio:live:";

/**
 * POST /api/studio/heartbeat
 *
 * Called by DawWorkspace every 30 s while the user is actively in the studio.
 * Writes `studio:live:{userId}` in Redis with a 45-second TTL.
 *
 * The production-timeline route reads these keys to set `isLiveNow` on posts.
 * No Redis = silently no-ops (feature degrades gracefully).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    // Redis not configured — heartbeat is a best-effort feature
    return NextResponse.json({ ok: true, live: false });
  }

  const key = `${KEY_PREFIX}${session.user.id}`;
  await redis.set(key, "1", "EX", HEARTBEAT_TTL_S);

  return NextResponse.json({ ok: true, live: true });
}

/**
 * DELETE /api/studio/heartbeat
 *
 * Called by DawWorkspace when the user explicitly leaves the studio
 * (pagehide / visibility change). Clears the live key immediately.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: true });
  }

  await redis.del(`${KEY_PREFIX}${session.user.id}`);
  return NextResponse.json({ ok: true });
}
