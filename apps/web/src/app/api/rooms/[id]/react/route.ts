import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { CHANNELS, createServerSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Audience emoji taps that float across the screen. Persisted for
// post-session heat history, broadcast for live render.
//
// Allow-list: only these six emojis are accepted. Lets us treat the
// "kind" column as a tiny varchar without worrying about arbitrary
// unicode payloads from the channel.
const ALLOWED_KINDS = new Set(["🔥", "❤️", "👏", "😮", "🎧", "💯"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Spam guard — moderate limiter is ~10 req / 10 s per key. One key
  // per user-per-room means a single mashed thumb still gets a few
  // dozen taps through; a botnet doesn't.
  const blocked = await rateLimit("moderate", `room:react:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  if (!body.kind || typeof body.kind !== "string" || !ALLOWED_KINDS.has(body.kind)) {
    return NextResponse.json({ error: "Invalid reaction kind" }, { status: 400 });
  }

  // Confirm the user is actually in the room (LISTENER, SPEAKER, or
  // HOST). Drive-by reactions from random tabs aren't allowed.
  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      status: true,
      participants: {
        where: { userId: session.user.id, leftAt: null },
        select: { id: true },
      },
    },
  });
  if (!room || room.status !== "LIVE") {
    return NextResponse.json({ error: "Room not live" }, { status: 410 });
  }
  if (room.participants.length === 0) {
    return NextResponse.json({ error: "Not in room" }, { status: 403 });
  }

  // Persist (best-effort) + broadcast (authoritative for live UI).
  // The broadcast is the source of truth for the floating-emoji
  // animation; the DB row is for post-session analytics. We don't
  // await the DB write before broadcasting so a slow Postgres trip
  // doesn't add lag to the reaction.
  void prisma.roomReaction
    .create({
      data: { roomId: id, userId: session.user.id, kind: body.kind },
    })
    .catch(() => {
      // best-effort
    });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    void supabase
      .channel(CHANNELS.room(id))
      .send({
        type: "broadcast",
        event: "reaction",
        payload: {
          userId: session.user.id,
          kind: body.kind,
          at: Date.now(),
        },
      })
      .catch(() => {
        // best-effort
      });
  }

  return NextResponse.json({ ok: true });
}
