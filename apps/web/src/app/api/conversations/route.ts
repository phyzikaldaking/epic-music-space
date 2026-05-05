import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lenientLimiter, strictLimiter } from "@/lib/rateLimit";
import { findOrCreateConversation, isBlocked } from "@/lib/conversations";

export const runtime = "nodejs";

/**
 * GET /api/conversations — list the viewer's conversations, most recent first.
 * Returns: [{ id, peer: {id,name,image,studio?}, lastMessageAt, lastMessage,
 *            unreadCount }, ...]
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await lenientLimiter.consume(`conv-list:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const me = session.user.id;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: {
      userA: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      userB: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, senderId: true, readAt: true },
      },
    },
  });

  // Per-row unread count (messages not authored by viewer, not read).
  const unread = await Promise.all(
    conversations.map((c) =>
      prisma.message.count({
        where: {
          conversationId: c.id,
          NOT: { senderId: me },
          readAt: null,
        },
      }),
    ),
  );

  const data = conversations.map((c, i) => {
    const peer = c.userAId === me ? c.userB : c.userA;
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      peer,
      lastMessageAt: c.lastMessageAt,
      lastMessage: last?.body ?? null,
      lastMessageMine: last ? last.senderId === me : false,
      unreadCount: unread[i],
    };
  });

  return NextResponse.json({ conversations: data });
}

const postSchema = z.object({
  peerId: z.string().cuid(),
});

/**
 * POST /api/conversations — find or create the 1:1 conversation with peerId.
 * Body: { peerId }. Returns: { id }.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`conv-create:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { peerId } = parsed.data;
  if (peerId === session.user.id) {
    return NextResponse.json(
      { error: "You can't message yourself." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({ where: { id: peerId }, select: { id: true } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (await isBlocked(session.user.id, peerId)) {
    return NextResponse.json(
      { error: "You can't message this user." },
      { status: 403 },
    );
  }

  const conv = await findOrCreateConversation(session.user.id, peerId);
  return NextResponse.json({ id: conv.id });
}
