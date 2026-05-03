import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function toSse(data: unknown, event?: string) {
  const payload = `data: ${JSON.stringify(data)}\n`;
  return event ? `event: ${event}\n${payload}\n` : `${payload}\n`;
}

/**
 * GET /api/auctions/:id/events
 * Server-sent events stream for real-time auction updates.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const sinceMs = Math.max(0, parseInt(req.nextUrl.searchParams.get("since") ?? "0", 10));

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      write(`retry: 2000\n`);

      let lastBidAt = sinceMs ? new Date(sinceMs) : new Date(0);
      let lastAuctionUpdatedAt = sinceMs ? new Date(sinceMs) : new Date(0);

      const sendSnapshot = async () => {
        const auction = await prisma.auction.findUnique({
          where: { id },
          include: { _count: { select: { bids: true } } },
        });
        if (!auction) {
          write(toSse({ error: "Auction not found" }, "error"));
          controller.close();
          return false;
        }
        write(
          toSse(
            {
              id: auction.id,
              status: auction.status,
              currentBid: auction.currentBid ? Number(auction.currentBid) : null,
              winnerId: auction.winnerId,
              endsAt: auction.endsAt,
              bidCount: auction._count.bids,
              updatedAt: auction.updatedAt,
            },
            "snapshot",
          ),
        );
        lastAuctionUpdatedAt = auction.updatedAt;
        return true;
      };

      if (!(await sendSnapshot())) return;

      const interval = setInterval(async () => {
        try {
          const [auction, latestBid] = await Promise.all([
            prisma.auction.findUnique({
              where: { id },
              include: { _count: { select: { bids: true } } },
            }),
            prisma.auctionBid.findFirst({
              where: { auctionId: id, createdAt: { gt: lastBidAt } },
              orderBy: { createdAt: "desc" },
              select: { id: true, amount: true, bidderId: true, createdAt: true },
            }),
          ]);

          if (!auction) {
            write(toSse({ error: "Auction not found" }, "error"));
            controller.close();
            clearInterval(interval);
            return;
          }

          if (auction.updatedAt > lastAuctionUpdatedAt) {
            write(
              toSse(
                {
                  id: auction.id,
                  status: auction.status,
                  currentBid: auction.currentBid ? Number(auction.currentBid) : null,
                  winnerId: auction.winnerId,
                  endsAt: auction.endsAt,
                  bidCount: auction._count.bids,
                  updatedAt: auction.updatedAt,
                },
                "auction",
              ),
            );
            lastAuctionUpdatedAt = auction.updatedAt;
          }

          if (latestBid) {
            write(
              toSse(
                {
                  id: latestBid.id,
                  amount: Number(latestBid.amount),
                  bidderId: latestBid.bidderId,
                  createdAt: latestBid.createdAt,
                },
                "bid",
              ),
            );
            lastBidAt = latestBid.createdAt;
          }

          write(`event: ping\ndata: {}\n\n`);
        } catch (err) {
          write(toSse({ error: "Internal error" }, "error"));
          console.error("[auctions/events]", err);
        }
      }, 1500);

      const abort = () => {
        clearInterval(interval);
        controller.close();
      };

      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

