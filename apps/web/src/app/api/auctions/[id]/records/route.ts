import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildAuctionRecordFileName,
  buildAuctionRecordsCsv,
  canViewAuctionRecords,
} from "@/lib/auctionRecords";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: {
      song: { select: { id: true, title: true, artist: true } },
      seller: { select: { id: true, name: true } },
      winner: { select: { id: true, name: true } },
      bids: {
        orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
        select: {
          amount: true,
          createdAt: true,
          bidderId: true,
        },
      },
    },
  });

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }

  const allowed = canViewAuctionRecords({
    viewerId: session.user.id,
    sellerId: auction.sellerId,
    winnerId: auction.winnerId,
    bidderIds: auction.bids.map((bid) => bid.bidderId),
    isAdmin: session.user.role === "ADMIN",
  });

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settlementTx = await prisma.transaction.findFirst({
    where: {
      type: "AUCTION_WIN",
      metadata: {
        path: ["auctionId"],
        equals: auction.id,
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      amount: true,
      updatedAt: true,
    },
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    legalReferences: {
      termsPath: "/legal/terms",
      licensingPath: "/legal/licensing",
      refundsPath: "/legal/refunds",
    },
    auction: {
      id: auction.id,
      status: auction.status,
      createdAt: auction.createdAt,
      endsAt: auction.endsAt,
      songId: auction.songId,
      songTitle: auction.song.title,
      songArtist: auction.song.artist,
      sellerId: auction.sellerId,
      sellerName: auction.seller.name,
      winnerId: auction.winnerId,
      winnerName: auction.winner?.name ?? null,
      startingBid: Number(auction.startingBid),
      reservePrice: auction.reservePrice == null ? null : Number(auction.reservePrice),
      currentBid: auction.currentBid == null ? null : Number(auction.currentBid),
      bids: auction.bids.map((bid) => ({
        bidderId: bid.bidderId,
        amount: Number(bid.amount),
        createdAt: bid.createdAt,
      })),
      settlement: settlementTx
        ? {
            transactionId: settlementTx.id,
            status: settlementTx.status,
            amount: Number(settlementTx.amount),
            settledAt: settlementTx.updatedAt,
          }
        : null,
    },
  };

  if (format === "json") {
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename=\"${buildAuctionRecordFileName(
          auction.id,
          "json",
        )}\"`,
      },
    });
  }

  const csv = buildAuctionRecordsCsv({
    id: payload.auction.id,
    status: payload.auction.status,
    createdAt: payload.auction.createdAt,
    endsAt: payload.auction.endsAt,
    settledAt: payload.auction.settlement?.settledAt,
    songId: payload.auction.songId,
    songTitle: payload.auction.songTitle,
    songArtist: payload.auction.songArtist,
    sellerId: payload.auction.sellerId,
    sellerName: payload.auction.sellerName,
    winnerId: payload.auction.winnerId,
    winnerName: payload.auction.winnerName,
    startingBid: payload.auction.startingBid,
    reservePrice: payload.auction.reservePrice,
    currentBid: payload.auction.currentBid,
    bids: payload.auction.bids,
    transactionId: payload.auction.settlement?.transactionId,
    transactionStatus: payload.auction.settlement?.status,
    transactionAmount: payload.auction.settlement?.amount,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename=\"${buildAuctionRecordFileName(
        auction.id,
        "csv",
      )}\"`,
    },
  });
}
