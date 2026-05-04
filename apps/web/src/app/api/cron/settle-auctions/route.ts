import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const CHECKOUT_TTL_SECONDS = 24 * 60 * 60;
const RETRY_BACKOFF_MINUTES = 5;
const MAX_AUCTION_CHECKOUT_RETRIES = 5;

type RetryMetadata = {
  auctionId?: string;
  sellerId?: string;
  retryState?: string;
  retryAfter?: string;
  retryCount?: number;
  lastError?: string;
};

function parseRetryMetadata(metadata: unknown): RetryMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return metadata as RetryMetadata;
}

function nextRetryAtIso(now: Date, retryCount: number) {
  return new Date(now.getTime() + retryCount * RETRY_BACKOFF_MINUTES * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const baseUrl = getSiteUrl();

  let retried = 0;
  let retry_failed = 0;

  // Retry queue: auction checkout session creation failures are represented as
  // FAILED AUCTION_WIN transactions with retry metadata.
  const failedQueue = await prisma.transaction.findMany({
    where: {
      type: "AUCTION_WIN",
      status: "FAILED",
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      amount: true,
      metadata: true,
    },
    take: 100,
  });

  const dueRetries = failedQueue.filter((tx) => {
    const md = parseRetryMetadata(tx.metadata);
    if (md.retryState !== "CHECKOUT_CREATE_FAILED" || !md.retryAfter) return false;
    return md.retryAfter <= now.toISOString();
  });

  for (const tx of dueRetries) {
    const md = parseRetryMetadata(tx.metadata);
    const auctionId = md.auctionId;
    if (!auctionId) continue;

    const alreadyResolved = await prisma.transaction.findFirst({
      where: {
        type: "AUCTION_WIN",
        status: { in: ["PENDING", "SUCCEEDED"] },
        metadata: {
          path: ["auctionId"],
          equals: auctionId,
        },
      },
      select: { id: true },
    });
    if (alreadyResolved) continue;

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        song: { select: { id: true, title: true, artist: true, coverUrl: true } },
      },
    });
    if (!auction || auction.status !== "ENDED" || !auction.winnerId) {
      continue;
    }

    const retryCount = (md.retryCount ?? 0) + 1;

    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(Number(tx.amount) * 100),
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
          userId: tx.userId,
          sellerId: auction.sellerId,
        },
        success_url: `${baseUrl}/auctions/${auction.id}?checkout=success`,
        cancel_url: `${baseUrl}/auctions/${auction.id}`,
      });

      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "PENDING",
          stripeSessionId: checkoutSession.id,
          metadata: {
            auctionId: auction.id,
            sellerId: auction.sellerId,
            retryState: "CHECKOUT_CREATED",
            retryCount,
          },
        },
      });

      await enqueueNotification({
        userId: tx.userId,
        type: "AUCTION_WON",
        title: "Winner checkout is ready",
        body: `Your checkout link for "${auction.song.title}" is ready. Complete payment within 24 hours to claim your license.`,
        metadata: {
          auctionId: auction.id,
          checkoutUrl: checkoutSession.url,
          songId: auction.song.id,
        },
      });

      retried++;
    } catch (err) {
      if (retryCount >= MAX_AUCTION_CHECKOUT_RETRIES) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            metadata: {
              auctionId,
              sellerId: md.sellerId ?? auction.sellerId,
              retryState: "CHECKOUT_RETRY_GAVE_UP",
              retryCount,
              lastError: String((err as Error)?.message ?? "unknown"),
            },
          },
        });

        await prisma.auction.updateMany({
          where: { id: auction.id, status: "ENDED" },
          data: { status: "EXPIRED", winnerId: null },
        });

        await Promise.allSettled([
          enqueueNotification({
            userId: auction.sellerId,
            type: "AUCTION_EXPIRED",
            title: "Auction expired after payment retries",
            body: `Winner checkout for "${auction.song.title}" could not be created after multiple attempts.`,
            metadata: { auctionId: auction.id },
          }),
          enqueueNotification({
            userId: tx.userId,
            type: "AUCTION_PAYMENT_EXPIRED",
            title: "Auction payment window expired",
            body: `We could not restore checkout for "${auction.song.title}" in time.`,
            metadata: { auctionId: auction.id },
          }),
        ]);
      } else {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: {
            metadata: {
              auctionId,
              sellerId: md.sellerId ?? auction.sellerId,
              retryState: "CHECKOUT_CREATE_FAILED",
              retryAfter: nextRetryAtIso(now, retryCount),
              retryCount,
              lastError: String((err as Error)?.message ?? "unknown"),
            },
          },
        });
      }

      retry_failed++;
      console.error(`[settle-auctions] Retry failed for auction ${auctionId}:`, err);
    }
  }

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

    const amountCents = Math.round(Number(topBid.amount) * 100);

    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS,
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

      // Queue retry state directly on a failed transaction so retries can run
      // independently from auction status transitions.
      await prisma.transaction.create({
        data: {
          userId: topBid.bidderId,
          songId: auction.song.id,
          amount: Number(topBid.amount),
          type: "AUCTION_WIN",
          status: "FAILED",
          metadata: {
            auctionId: auction.id,
            sellerId: auction.sellerId,
            retryState: "CHECKOUT_CREATE_FAILED",
            retryAfter: nextRetryAtIso(now, 1),
            retryCount: 1,
            lastError: String((err as Error)?.message ?? "unknown"),
          },
        },
      });

      retry_failed++;
    }
  }

  console.log(
    `[settle-auctions] settled=${settled} expired=${expired_count} total=${expired.length} retried=${retried} retry_failed=${retry_failed}`,
  );
  return NextResponse.json({
    settled,
    expired: expired_count,
    total: expired.length,
    retried,
    retry_failed,
  });
}
