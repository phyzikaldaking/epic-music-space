import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  deliverableUrl: z.string().url(),
  message: z.string().max(1000).optional(),
});

/**
 * Provider marks a service order as DELIVERED with a download/playback URL.
 * Notifies the buyer.
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
    select: { id: true, providerId: true, buyerId: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.providerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status === "REFUNDED" || order.status === "CANCELLED") {
    return NextResponse.json({ error: `Order ${order.status.toLowerCase()}` }, { status: 410 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deliverable URL" }, { status: 400 });
  }

  await prisma.serviceOrder.update({
    where: { id: order.id },
    data: {
      deliverableUrl: parsed.data.deliverableUrl,
      status: "DELIVERED",
      deliveredAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
