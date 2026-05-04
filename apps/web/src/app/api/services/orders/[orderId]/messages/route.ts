import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const schema = z.object({
  body: z.string().min(1).max(4000),
  attachmentUrl: z.string().url().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;

  const blocked = await rateLimit("moderate", `order:msg:${session.user.id}:${orderId}`);
  if (blocked) return blocked;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: { id: true, buyerId: true, providerId: true, status: true, listingId: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.buyerId !== session.user.id && order.providerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const message = await prisma.serviceOrderMessage.create({
    data: {
      orderId: order.id,
      fromUserId: session.user.id,
      body: parsed.data.body.trim(),
      attachmentUrl: parsed.data.attachmentUrl ?? null,
    },
    include: { fromUser: { select: { id: true, name: true, image: true } } },
  });

  // Notify the other party
  const recipient = order.buyerId === session.user.id ? order.providerId : order.buyerId;
  try {
    await enqueueNotification({
      userId: recipient,
      type: "ORDER_MESSAGE",
      title: "New message on your order",
      body: parsed.data.body.slice(0, 140),
      metadata: { orderId: order.id },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ message });
}
