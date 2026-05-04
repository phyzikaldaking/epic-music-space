import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

/**
 * Buyer accepts a delivered order. Status → COMPLETED, completedAt now.
 * The provider's PENDING revenue split is already recorded; nothing more
 * to do here money-wise (the weekly cron will pay it out).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orderId } = await params;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: { id: true, buyerId: true, providerId: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status !== "DELIVERED") {
    return NextResponse.json({ error: `Order is ${order.status.toLowerCase()}` }, { status: 409 });
  }

  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  try {
    await enqueueNotification({
      userId: order.providerId,
      type: "ORDER_ACCEPTED",
      title: "Order approved 🎉",
      body: "The buyer signed off — your payout settles in the next weekly cycle.",
      metadata: { orderId: order.id },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
