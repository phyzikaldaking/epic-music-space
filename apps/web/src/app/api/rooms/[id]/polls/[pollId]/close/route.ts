import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { CHANNELS, createServerSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Author or host closes a poll early. Closed polls stop accepting
// votes but stay visible with their final tallies until the room ends.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; pollId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, pollId } = await params;
  const blocked = await rateLimit("moderate", `room:poll:close:${session.user.id}:${pollId}`);
  if (blocked) return blocked;

  const room = await prisma.room.findUnique({
    where: { id },
    select: { hostId: true },
  });
  const poll = await prisma.roomPoll.findFirst({
    where: { id: pollId, roomId: id },
    select: { authorId: true, closedAt: true },
  });
  if (!poll || !room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.authorId !== session.user.id && room.hostId !== session.user.id) {
    return NextResponse.json({ error: "Only author or host can close" }, { status: 403 });
  }
  if (poll.closedAt) {
    return NextResponse.json({ ok: true });
  }

  await prisma.roomPoll.update({
    where: { id: pollId },
    data: { closedAt: new Date() },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    void supabase
      .channel(CHANNELS.room(id))
      .send({ type: "broadcast", event: "poll.closed", payload: { pollId } })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
