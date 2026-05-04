import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(
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
    select: {
      id: true,
      ownerId: true,
      title: true,
      location: true,
      mediaUrl: true,
      linkUrl: true,
      startDate: true,
      endDate: true,
      isActive: true,
      price: true,
    },
  });
  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = placement.ownerId === session.user.id;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!isOwner && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [impressions, uniqueImpressions, clicks, uniqueClicks] = await Promise.all([
    prisma.adImpression.count({ where: { placementId: id } }),
    prisma.adImpression.findMany({
      where: { placementId: id },
      distinct: ["ipHash"],
      select: { id: true },
    }).then((rows) => rows.length),
    prisma.adClick.count({ where: { placementId: id } }),
    prisma.adClick.findMany({
      where: { placementId: id },
      distinct: ["ipHash"],
      select: { id: true },
    }).then((rows) => rows.length),
  ]);

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const now = Date.now();
  const totalMs = placement.endDate.getTime() - placement.startDate.getTime();
  const elapsedMs = Math.max(0, Math.min(totalMs, now - placement.startDate.getTime()));
  const remainingMs = Math.max(0, placement.endDate.getTime() - now);

  return NextResponse.json({
    placement: {
      id: placement.id,
      title: placement.title,
      location: placement.location,
      mediaUrl: placement.mediaUrl,
      linkUrl: placement.linkUrl,
      startDate: placement.startDate,
      endDate: placement.endDate,
      isActive: placement.isActive,
      price: placement.price.toString(),
    },
    stats: {
      impressions,
      uniqueImpressions,
      clicks,
      uniqueClicks,
      ctr,
      ctrPct: (ctr * 100).toFixed(2),
      elapsedMs,
      totalMs,
      remainingMs,
      progressPct: totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0,
    },
  });
}
