import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";
import { isBlocked } from "@/lib/conversations";
import { enqueueNotification } from "@/lib/queues";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";
import { validateTrustSafetyInput } from "@/lib/trustSafety";

export const runtime = "nodejs";

async function loadConversation(id: string, viewerId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!conv) return null;
  if (conv.userAId !== viewerId && conv.userBId !== viewerId) return null;
  return conv;
}

/**
 * GET /api/conversations/[id]/messages?cursor=&limit=
 *   Cursor-paginated message list (oldest→newest). Marks any messages
 *   the viewer hasn't seen as read on the way out.
 *
 * POST /api/conversations/[id]/messages
 *   Body: { body }. Sends a message, bumps lastMessageAt, fires a
 *   notification to the peer.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`messages-list:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const { id } = await params;
  const conv = await loadConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const cursor = url.searchParams.get("cursor");

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      senderId: true,
      readAt: true,
      createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (messages.length > limit) {
    const last = messages.pop()!;
    nextCursor = last.id;
  }

  // Mark peer messages as read — best-effort, fire and forget.
  void prisma.message
    .updateMany({
      where: {
        conversationId: id,
        NOT: { senderId: session.user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    .catch(() => {
      /* ignore */
    });

  return NextResponse.json({ messages, nextCursor });
}

const postSchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    // Per-user-per-conversation + per-IP — stops a single account from
    // flooding one thread, plus a global IP ceiling.
    await strictLimiter.consume(`message-send:${session.user.id}`);
    await strictLimiter.consume(`message-send:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Sending too quickly." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const { id } = await params;
  const conv = await loadConversation(id, session.user.id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const peerId = conv.userAId === session.user.id ? conv.userBId : conv.userAId;
  if (await isBlocked(session.user.id, peerId)) {
    return NextResponse.json(
      { error: "You can't message this user." },
      { status: 403 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Same trust+safety filter as posts and comments — slur lists, link
  // limits, all-caps spam, etc. Surfaces the underlying code so the
  // client can show a useful message instead of a generic 400.
  const trustSafety = validateTrustSafetyInput(parsed.data.body);
  if (!trustSafety.ok) {
    return NextResponse.json(
      { error: trustSafety.message, code: trustSafety.code },
      { status: 400 },
    );
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        senderId: session.user.id,
        body: parsed.data.body,
      },
      select: { id: true, body: true, senderId: true, readAt: true, createdAt: true },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  // Realtime broadcast on the per-conversation channel — both clients are
  // subscribed, so the receiving end sees the new message without waiting
  // for the next 5s poll. Best-effort; subscribers fall back to the
  // existing poll if Supabase is unreachable.
  void (async () => {
    try {
      const supabase = createServerSupabaseClient();
      if (!supabase) return;
      await supabase.channel(CHANNELS.conversation(id)).send({
        type: "broadcast",
        event: "message",
        payload: { message },
      });
    } catch (err) {
      console.warn("[messages:send] realtime broadcast failed", err);
    }
  })();

  // Notify the peer (best-effort; pref consumer handles opt-out).
  void (async () => {
    try {
      const sender = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true },
      });
      const senderName = sender?.name ?? "Someone";
      const snippet = parsed.data.body.length > 140
        ? `${parsed.data.body.slice(0, 140)}…`
        : parsed.data.body;
      await enqueueNotification({
        userId: peerId,
        type: "DM",
        title: `New message from ${senderName}`,
        body: snippet,
        metadata: { conversationId: id, fromUserId: session.user.id },
      });
    } catch (err) {
      console.warn("[messages:send] notify failed", err);
    }
  })();

  return NextResponse.json({ message });
}
