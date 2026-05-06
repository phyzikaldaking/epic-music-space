import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";

export const runtime = "nodejs";

const sendSchema = z.object({
  body: z.string().min(1).max(500),
});

const hideSchema = z.object({
  messageId: z.string().cuid(),
});

/**
 * POST /api/verzuz/[id]/message — send a chat message during the match.
 * GET  /api/verzuz/[id]/message — paginate the latest 100 visible messages.
 * PATCH /api/verzuz/[id]/message — host hides a message (soft delete).
 *
 * Persists to VerzuzMessage AND broadcasts on the existing Supabase
 * channel so every viewer sees it within ~150ms. The shipped Verzuz UI
 * already subscribes to that channel for vote_update / reaction events;
 * the new "verzuz_message" / "verzuz_message_hidden" events join the bus.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const messages = await prisma.verzuzMessage.findMany({
    where: { matchId: id, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      roundNumber: true,
      body: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
    },
  });

  return NextResponse.json({ messages: messages.reverse() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });
  }

  const { id } = await params;
  const blocked = await rateLimit("moderate", `verzuz:msg:${session.user.id}:${id}`);
  if (blocked) return blocked;

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const match = await prisma.verzuzMatch.findUnique({
    where: { id },
    select: { status: true, currentRound: true, totalRounds: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status === "COMPLETED") {
    return NextResponse.json({ error: "Match has ended" }, { status: 410 });
  }

  const message = await prisma.verzuzMessage.create({
    data: {
      matchId: id,
      userId: session.user.id,
      roundNumber: Math.min(match.currentRound, match.totalRounds),
      body: parsed.data.body.trim(),
    },
    select: {
      id: true,
      userId: true,
      roundNumber: true,
      body: true,
      createdAt: true,
      user: { select: { name: true, image: true } },
    },
  });

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase
      .channel(CHANNELS.versus(id))
      .send({
        type: "broadcast",
        event: "verzuz_message",
        payload: { message },
      })
      .catch(() => null);
  }

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * PATCH — only the two participating artists can hide a message.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = hideSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const match = await prisma.verzuzMatch.findUnique({
    where: { id },
    select: { artistAId: true, artistBId: true },
  });
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  const isArtist =
    match.artistAId === session.user.id || match.artistBId === session.user.id;
  if (!isArtist) {
    return NextResponse.json(
      { error: "Only the artists in this match can moderate chat." },
      { status: 403 },
    );
  }

  const updated = await prisma.verzuzMessage.updateMany({
    where: { id: parsed.data.messageId, matchId: id, isHidden: false },
    data: { isHidden: true },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Message not found or already hidden" }, { status: 404 });
  }

  const supabase = createServerSupabaseClient();
  if (supabase) {
    await supabase
      .channel(CHANNELS.versus(id))
      .send({
        type: "broadcast",
        event: "verzuz_message_hidden",
        payload: { messageId: parsed.data.messageId },
      })
      .catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
