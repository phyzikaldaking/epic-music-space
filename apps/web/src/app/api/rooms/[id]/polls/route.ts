import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { CHANNELS, createServerSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

// POST: host (or any stage seat — SPEAKER) drops a poll.
// GET:  audience pulls current open polls + tallies.

const MAX_OPTIONS = 6;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const blocked = await rateLimit("moderate", `room:poll:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    options?: string[];
    closesInSec?: number;
  };

  const question = (body.question ?? "").trim();
  if (!question || question.length > 140) {
    return NextResponse.json({ error: "Question 1–140 chars" }, { status: 400 });
  }
  if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > MAX_OPTIONS) {
    return NextResponse.json(
      { error: `Need 2–${MAX_OPTIONS} options` },
      { status: 400 },
    );
  }
  // Build option records with stable ids. Using `opt_<index>` keeps
  // votes correlatable without trusting client-supplied ids.
  const options = body.options.map((label, i) => {
    const text = String(label ?? "").trim().slice(0, 60);
    return { id: `opt_${i}`, label: text };
  });
  if (options.some((o) => !o.label)) {
    return NextResponse.json({ error: "Option labels required" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    select: {
      status: true,
      participants: {
        where: { userId: session.user.id, leftAt: null },
        select: { role: true },
      },
    },
  });
  if (!room || room.status !== "LIVE") {
    return NextResponse.json({ error: "Room not live" }, { status: 410 });
  }
  // Only stage seats (HOST + SPEAKER) can drop polls. Audience can
  // only vote — drives the social pressure to get promoted.
  const role = room.participants[0]?.role;
  if (role !== "HOST" && role !== "SPEAKER") {
    return NextResponse.json({ error: "Only stage can poll" }, { status: 403 });
  }

  const closesInSec = Math.min(Math.max(body.closesInSec ?? 60, 10), 600);

  const poll = await prisma.roomPoll.create({
    data: {
      roomId: id,
      authorId: session.user.id,
      question,
      options,
      closesAt: new Date(Date.now() + closesInSec * 1000),
    },
    select: {
      id: true,
      question: true,
      options: true,
      closesAt: true,
      createdAt: true,
    },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    void supabase
      .channel(CHANNELS.room(id))
      .send({
        type: "broadcast",
        event: "poll.created",
        payload: { poll },
      })
      .catch(() => {});
  }

  return NextResponse.json({ poll });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const polls = await prisma.roomPoll.findMany({
    where: { roomId: id, closedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      question: true,
      options: true,
      closesAt: true,
      createdAt: true,
      votes: {
        select: { optionId: true, userId: true },
      },
    },
  });

  // Roll up per-option tallies + the caller's own vote (if any).
  const shaped = polls.map((p) => {
    const tallies: Record<string, number> = {};
    let myVote: string | null = null;
    for (const v of p.votes) {
      tallies[v.optionId] = (tallies[v.optionId] ?? 0) + 1;
      if (v.userId === session.user!.id) myVote = v.optionId;
    }
    return {
      id: p.id,
      question: p.question,
      options: p.options,
      closesAt: p.closesAt,
      createdAt: p.createdAt,
      tallies,
      myVote,
      totalVotes: p.votes.length,
    };
  });

  return NextResponse.json({ polls: shaped });
}
