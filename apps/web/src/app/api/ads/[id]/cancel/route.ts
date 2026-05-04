import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Cancel an active ad placement. Sets isActive=false and shortens endDate
 * to "now" so the slot stops serving immediately. We do NOT issue a refund
 * automatically — partial-refund eligibility depends on remaining flight
 * time and is left to ops review. The client gets a hint.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const placement = await prisma.adPlacement.findUnique({
    where: { id },
    select: { ownerId: true, startDate: true, endDate: true, price: true, isActive: true },
  });
  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (placement.ownerId !== session.user.id) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    if (me?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  const totalMs = placement.endDate.getTime() - placement.startDate.getTime();
  const remainingMs = Math.max(0, placement.endDate.getTime() - now.getTime());
  const refundEligibleDollars = totalMs > 0
    ? Math.max(0, Number(placement.price) * (remainingMs / totalMs))
    : 0;

  await prisma.adPlacement.update({
    where: { id },
    data: { isActive: false, endDate: now },
  });

  return NextResponse.json({
    ok: true,
    refundEligibleDollars: Number(refundEligibleDollars.toFixed(2)),
    note: "Refund requests are reviewed by ops. Email support@epicmusicspace.com to request a partial refund of the remaining flight time.",
  });
}
