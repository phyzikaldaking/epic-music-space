import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
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
    include: {
      listing: { select: { id: true, title: true, kind: true, downloadUrl: true } },
      buyer:    { select: { id: true, name: true, image: true, username: true } },
      provider: { select: { id: true, name: true, image: true, username: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { fromUser: { select: { id: true, name: true, image: true } } },
      },
      revisions: { orderBy: { revisionNumber: "asc" } },
      review: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (order.buyerId !== session.user.id && order.providerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ order });
}
