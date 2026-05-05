import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueNotification } from "@/lib/queues";
import { requireCronRequest } from "@/lib/routeAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily: any DELIVERED order whose acceptDeadline has passed gets
 * auto-promoted to COMPLETED. Notifies the buyer + provider so they have
 * a paper trail of the auto-acceptance.
 */
export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const now = new Date();
  const candidates = await prisma.serviceOrder.findMany({
    where: {
      status: "DELIVERED",
      acceptDeadline: { lte: now },
    },
    select: { id: true, buyerId: true, providerId: true },
    take: 200,
  });

  let accepted = 0;
  for (const o of candidates) {
    await prisma.serviceOrder.update({
      where: { id: o.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    accepted += 1;
    try {
      await enqueueNotification({
        userId: o.providerId,
        type: "ORDER_AUTO_ACCEPTED",
        title: "Order auto-approved",
        body: "The buyer didn't respond in 14 days — your payout settles in the next weekly cycle.",
        metadata: { orderId: o.id, auto: true },
      });
      await enqueueNotification({
        userId: o.buyerId,
        type: "ORDER_AUTO_ACCEPTED",
        title: "Order auto-approved",
        body: "Your delivered order auto-accepted after 14 days. Funds released to the engineer.",
        metadata: { orderId: o.id, auto: true },
      });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true, accepted });
}
