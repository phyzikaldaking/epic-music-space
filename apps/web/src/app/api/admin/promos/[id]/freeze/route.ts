import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

const FreezeSchema = z.object({
  couponId: z.string().min(1).max(255),
  reason: z.string().max(1000).optional(),
});

/**
 * POST /api/admin/promos/[id]/freeze
 * Freezes a Stripe coupon ID — all future badge awards / redemption
 * checks will see the freeze and reject the action.
 *
 * DELETE /api/admin/promos/[id]/freeze
 * Removes the freeze (unfreeze).
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: couponId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = FreezeSchema.safeParse({ couponId, ...body });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const adminId = (session.user as { id: string }).id;

  const freeze = await prisma.promoCodeFreeeze.upsert({
    where: { couponId },
    create: {
      couponId,
      frozenBy: adminId,
      reason: parsed.data.reason,
    },
    update: {
      frozenBy: adminId,
      frozenAt: new Date(),
      reason: parsed.data.reason,
      unfrozenAt: null,
      unfrozenBy: null,
    },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "promo.freeze",
      target: couponId,
      metadata: { reason: parsed.data.reason },
    },
  });

  return NextResponse.json({ ok: true, freeze });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: couponId } = await params;
  const adminId = (session.user as { id: string }).id;

  const existing = await prisma.promoCodeFreeeze.findUnique({ where: { couponId } });
  if (!existing) {
    return NextResponse.json({ error: "Not frozen" }, { status: 404 });
  }

  const updated = await prisma.promoCodeFreeeze.update({
    where: { couponId },
    data: { unfrozenAt: new Date(), unfrozenBy: adminId },
  });

  await prisma.adminActionLog.create({
    data: {
      adminId,
      action: "promo.unfreeze",
      target: couponId,
    },
  });

  return NextResponse.json({ ok: true, updated });
}
