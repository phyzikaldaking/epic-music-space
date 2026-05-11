import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { CHANNELS, createServerSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// One vote per (poll, user). Re-voting overwrites via upsert so a
// user can change their mind before the poll closes.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; pollId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, pollId } = await params;
  const blocked = await rateLimit("moderate", `room:vote:${session.user.id}:${pollId}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { optionId?: string };
  if (!body.optionId || typeof body.optionId !== "string") {
    return NextResponse.json({ error: "optionId required" }, { status: 400 });
  }

  const poll = await prisma.roomPoll.findFirst({
    where: { id: pollId, roomId: id },
    select: { id: true, options: true, closedAt: true, closesAt: true },
  });
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.closedAt || (poll.closesAt && poll.closesAt < new Date())) {
    return NextResponse.json({ error: "Poll closed" }, { status: 410 });
  }
  // Validate optionId against the stored options array so we never
  // store a garbage vote.
  const opts = Array.isArray(poll.options) ? (poll.options as Array<{ id: string }>) : [];
  if (!opts.some((o) => o.id === body.optionId)) {
    return NextResponse.json({ error: "Invalid option" }, { status: 400 });
  }

  // Must be in the room (any role can vote).
  const inRoom = await prisma.roomParticipant.findFirst({
    where: { roomId: id, userId: session.user.id, leftAt: null },
    select: { id: true },
  });
  if (!inRoom) return NextResponse.json({ error: "Not in room" }, { status: 403 });

  await prisma.roomPollVote.upsert({
    where: { pollId_userId: { pollId, userId: session.user.id } },
    create: { pollId, userId: session.user.id, optionId: body.optionId },
    update: { optionId: body.optionId },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    void supabase
      .channel(CHANNELS.room(id))
      .send({
        type: "broadcast",
        event: "poll.voted",
        payload: { pollId, optionId: body.optionId, userId: session.user.id },
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
