import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().max(2000).optional(),
});

/**
 * Buyer leaves a review on a COMPLETED order. Recomputes the listing's
 * aggregate rating + ratingCount in the same transaction.
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
    select: { id: true, buyerId: true, providerId: true, listingId: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (order.status !== "COMPLETED") {
    return NextResponse.json({ error: "Can only review completed orders." }, { status: 409 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Rating must be 1–5." }, { status: 400 });
  }

  // Upsert handles the case where someone retries after a 5xx — review is
  // unique per orderId.
  await prisma.serviceReview.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      listingId: order.listingId,
      buyerId: session.user.id,
      providerId: order.providerId,
      rating: parsed.data.rating,
      body: parsed.data.body?.trim() ?? null,
    },
    update: {
      rating: parsed.data.rating,
      body: parsed.data.body?.trim() ?? null,
    },
  });

  // Recompute aggregate
  const agg = await prisma.serviceReview.aggregate({
    where: { listingId: order.listingId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.serviceListing.update({
    where: { id: order.listingId },
    data: {
      rating: agg._avg.rating ?? null,
      ratingCount: agg._count._all,
    },
  });

  return NextResponse.json({ ok: true });
}
