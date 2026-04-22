import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      song: {
        select: {
          id: true,
          title: true,
          artist: true,
          coverUrl: true,
          genre: true,
          description: true,
          audioUrl: true,
          revenueSharePct: true,
        },
      },
      seller: { select: { id: true, name: true, username: true, image: true } },
      winner: { select: { id: true, name: true, username: true, image: true } },
      bids: {
        orderBy: { amount: "desc" },
        take: 50,
        include: {
          bidder: { select: { id: true, name: true, username: true, image: true } },
        },
      },
      _count: { select: { bids: true } },
    },
  });

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  return NextResponse.json(auction);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { _count: { select: { bids: true } } },
  });

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  if (auction.sellerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (auction.status !== "ACTIVE") {
    return NextResponse.json({ error: "Auction is not active" }, { status: 409 });
  }
  if (auction._count.bids > 0) {
    return NextResponse.json(
      { error: "Cannot cancel an auction with existing bids" },
      { status: 409 },
    );
  }

  await prisma.auction.update({ where: { id }, data: { status: "CANCELLED" } });

  return NextResponse.json({ success: true });
}
