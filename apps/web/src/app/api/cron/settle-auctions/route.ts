import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Fail-closed: reject all requests if CRON_SECRET is not set or doesn't match
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expired = await prisma.auction.findMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    include: {
      song: { select: { id: true, title: true, artist: true, coverUrl: true } },
      seller: { select: { id: true, name: true, username: true } },
      bids: {
        orderBy: { amount: "desc" },
        take: 1,
        include: { bidder: { select: { id: true, name: true, username: true } } },
      },
    },
  });

  let settled = 0;
  let expired_count = 0;

  for (const auction of expired) {
    const topBid = auction.bids[0];
    const reserveMet =
      topBid && (!auction.reservePrice || Number(topBid.amount) >= Number(auction.reservePrice));

    if (!topBid || !reserveMet) {
      await prisma.auction.update({
        where: { id: auction.id },
        data: { status: "EXPIRED", winnerId: null },
      });

      await enqueueNotification({
        userId: auction.sellerId,
        type: "AUCTION_EXPIRED",
        title: "Auction ended with no winner",
        body: `Your auction for "${auction.song.title}" ended with ${!topBid ? "no bids" : "bids below your reserve price"}. You can create a new auction any time.`,
        metadata: { auctionId: auction.id, songId: auction.songId },
      });
      expired_count++;
      continue;
    }

    await prisma.auction.update({
      where: { id: auction.id },
      data: { status: "ENDED", winnerId: topBid.bidderId, currentBid: topBid.amount },
    });

    const baseUrl = getSiteUrl();
    const amountCents = Math.round(Number(topBid.amount) * 100);

    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: `Auction Win: ${auction.song.title} by ${auction.song.artist}`,
                description: `You won the license auction for "${auction.song.title}". Complete your payment to receive the license.`,
                images: auction.song.coverUrl ? [auction.song.coverUrl] : [],
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "auction_win",
          auctionId: auction.id,
          songId: auction.song.id,
          userId: topBid.bidderId,
          sellerId: auction.sellerId,
        },
        success_url: `${baseUrl}/auctions/${auction.id}?checkout=success`,
        cancel_url: `${baseUrl}/auctions/${auction.id}`,
      });

      await prisma.transaction.create({
        data: {
          userId: topBid.bidderId,
          songId: auction.song.id,
          amount: Number(topBid.amount),
          type: "AUCTION_WIN",
          status: "PENDING",
          stripeSessionId: checkoutSession.id,
          metadata: { auctionId: auction.id, sellerId: auction.sellerId },
        },
      });

      await enqueueNotification({
        userId: topBid.bidderId,
        type: "AUCTION_WON",
        title: "You won the auction!",
        body: `You won "${auction.song.title}" with a bid of $${Number(topBid.amount).toFixed(2)}. Complete your payment within 24 hours to claim your license.`,
        metadata: {
          auctionId: auction.id,
          checkoutUrl: checkoutSession.url,
          songId: auction.song.id,
        },
      });

      await enqueueNotification({
        userId: auction.sellerId,
        type: "AUCTION_ENDED",
        title: "Auction ended — winner notified!",
        body: `Your auction for "${auction.song.title}" ended. Winning bid: $${Number(topBid.amount).toFixed(2)}. The winner has 24 hours to complete payment.`,
        metadata: { auctionId: auction.id, winnerBid: Number(topBid.amount) },
      });

      settled++;
    } catch (err) {
      console.error(`[settle-auctions] Failed to create checkout for auction ${auction.id}:`, err);
    }
  }

  console.log(
    `[settle-auctions] settled=${settled} expired=${expired_count} total=${expired.length}`,
  );
  return NextResponse.json({ settled, expired: expired_count, total: expired.length });
}
