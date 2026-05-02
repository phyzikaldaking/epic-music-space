import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";
import { z } from "zod";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const bidSchema = z.object({
  amount: z.number().positive().max(1_000_000),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bidSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { amount } = parsed.data;

  const auction = await prisma.auction.findUnique({
    where: { id },
    include: { song: { select: { title: true, artistId: true } } },
  });

  if (!auction) {
    return NextResponse.json({ error: "Auction not found" }, { status: 404 });
  }
  if (auction.status !== "ACTIVE") {
    return NextResponse.json({ error: "Auction is not active" }, { status: 409 });
  }
  if (new Date() >= auction.endsAt) {
    return NextResponse.json({ error: "Auction has ended" }, { status: 409 });
  }
  if (auction.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot bid on your own auction" }, { status: 403 });
  }

  const minBid = auction.currentBid
    ? Number(auction.currentBid) + 0.01
    : Number(auction.startingBid);

  if (amount < minBid) {
    return NextResponse.json(
      { error: `Bid must be at least $${minBid.toFixed(2)}` },
      { status: 400 },
    );
  }

  // Use winnerId (the current top bidder set on each bid) instead of a lookup-by-amount
  // to avoid false matches when two bidders submit the same amount concurrently.
  const previousTopBidderId = auction.winnerId ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.auctionBid.create({
      data: { auctionId: id, bidderId: session.user.id, amount },
    });
    await tx.auction.update({
      where: { id },
      data: { currentBid: amount, winnerId: session.user.id },
    });
  });

  if (previousTopBidderId && previousTopBidderId !== session.user.id) {
    await enqueueNotification({
      userId: previousTopBidderId,
      type: "AUCTION_OUTBID",
      title: "You've been outbid!",
      body: `Someone placed a higher bid of $${amount.toFixed(2)} on "${auction.song.title}". Bid again to stay in the lead.`,
      metadata: { auctionId: id, songTitle: auction.song.title, newBid: amount },
    });
  }

  await enqueueNotification({
    userId: auction.sellerId,
    type: "AUCTION_BID_RECEIVED",
    title: "New bid on your auction!",
    body: `Someone bid $${amount.toFixed(2)} on "${auction.song.title}".`,
    metadata: { auctionId: id, amount },
  });

  return NextResponse.json({ success: true, currentBid: amount });
}
