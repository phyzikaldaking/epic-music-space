import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/conversations/unread-count
 * Returns: { unread: number }
 *
 * Cheap query for the navbar / mobile bottom-nav DM badge. We count
 * messages addressed to the viewer (not authored by them) that have no
 * readAt across every conversation they're a participant in.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ unread: 0 });
  }
  const me = session.user.id;

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    select: { id: true },
  });
  if (conversations.length === 0) return NextResponse.json({ unread: 0 });

  const unread = await prisma.message.count({
    where: {
      conversationId: { in: conversations.map((c) => c.id) },
      NOT: { senderId: me },
      readAt: null,
    },
  });

  return NextResponse.json({ unread });
}
