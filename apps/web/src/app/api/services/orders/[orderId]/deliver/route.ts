import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const schema = z.object({
  deliverableUrl: z.string().url(),
  message: z.string().max(2000).optional(),
});

const ACCEPT_WINDOW_DAYS = 14;

/**
 * Provider delivers (or re-delivers) a service order. Each call appends a
 * new ServiceOrderRevision so the buyer can see a v1/v2/v3 history.
 *
 * - First delivery: status PAID/IN_PROGRESS → DELIVERED.
 * - After REVISION_REQUESTED: status → DELIVERED, revisionsUsed++.
 * - acceptDeadline = now + 14d. Cron auto-accepts when buyer is silent.
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

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: { id: true, providerId: true, buyerId: true, status: true, revisionsUsed: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.providerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    order.status === "REFUNDED" ||
    order.status === "CANCELLED" ||
    order.status === "COMPLETED"
  ) {
    return NextResponse.json({ error: `Order ${order.status.toLowerCase()}` }, { status: 410 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deliverable URL" }, { status: 400 });
  }

  const isRevision = order.status === "REVISION_REQUESTED";
  // revisionNumber: 1 = original delivery, 2 = first revision, etc.
  // We count existing revisions then add one.
  const existing = await prisma.serviceOrderRevision.count({ where: { orderId: order.id } });
  const nextRevisionNumber = existing + 1;

  const now = new Date();
  const deadline = new Date(now.getTime() + ACCEPT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.serviceOrderRevision.create({
      data: {
        orderId: order.id,
        revisionNumber: nextRevisionNumber,
        deliverableUrl: parsed.data.deliverableUrl,
        message: parsed.data.message ?? null,
      },
    }),
    prisma.serviceOrder.update({
      where: { id: order.id },
      data: {
        deliverableUrl: parsed.data.deliverableUrl,
        status: "DELIVERED",
        deliveredAt: now,
        acceptDeadline: deadline,
        ...(isRevision ? { revisionsUsed: { increment: 1 } } : {}),
      },
    }),
  ]);

  try {
    await enqueueNotification({
      userId: order.buyerId,
      type: "ORDER_DELIVERED",
      title: isRevision ? `Revision v${nextRevisionNumber} delivered` : "Your order is ready",
      body: "Listen, request revisions if needed, or approve to release the funds.",
      metadata: { orderId: order.id, revisionNumber: nextRevisionNumber },
    });
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true, revisionNumber: nextRevisionNumber });
}
