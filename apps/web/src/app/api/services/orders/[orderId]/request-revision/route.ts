import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { rateLimit } from "@/lib/rateLimitInline";

export const runtime = "nodejs";

const schema = z.object({ message: z.string().min(5).max(2000) });

const MAX_REVISIONS = 3;

/**
 * Buyer asks for a revision. Status → REVISION_REQUESTED.
 * Caps at 3 revisions; further requests must be negotiated via chat.
 * The revision message is also posted as an order chat message so it's
 * always visible in the thread.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;

  const blocked = await rateLimit("moderate", `order:revise:${session.user.id}:${orderId}`);
  if (blocked) return blocked;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: { id: true, buyerId: true, providerId: true, status: true, revisionsUsed: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status !== "DELIVERED") {
    return NextResponse.json({ error: "Can only request revisions on delivered orders." }, { status: 409 });
  }
  if (order.revisionsUsed >= MAX_REVISIONS) {
    return NextResponse.json(
      { error: `Free revisions used (${MAX_REVISIONS}). Use chat to negotiate further.` },
      { status: 409 },
    );
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tell the engineer what to change (5–2000 chars)." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.serviceOrder.update({
      where: { id: order.id },
      data: { status: "REVISION_REQUESTED", acceptDeadline: null },
    }),
    prisma.serviceOrderMessage.create({
      data: {
        orderId: order.id,
        fromUserId: session.user.id,
        body: `🔁 Revision requested: ${parsed.data.message}`,
      },
    }),
  ]);

  try {
    await enqueueNotification({
      userId: order.providerId,
      type: "ORDER_REVISION_REQUESTED",
      title: "Revision requested",
      body: parsed.data.message.slice(0, 140),
      metadata: { orderId: order.id },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
