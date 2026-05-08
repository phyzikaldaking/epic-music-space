import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";
import { getMinimumAuctionBid, normalizeUsdAmount } from "@/lib/auctionMath";
import { z } from "zod";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Defaults applied when an Auction row's anti-snipe columns are NULL
// (legacy rows from before the columns existed). These match the
// previous hardcoded 2/2-minute behaviour so live auctions don't change
// semantics when this code deploys.
const DEFAULT_ANTI_SNIPE_WINDOW_MIN = 2;
const DEFAULT_ANTI_SNIPE_EXTENSION_MIN = 2;

const bidSchema = z.object({
  amount: z
    .number()
    .positive()
    .max(1_000_000)
    .transform((v) => normalizeUsdAmount(v)),
});

class BidConflictRetryError extends Error {
  constructor() {
    super("AUCTION_BID_CONFLICT_RETRY");
    this.name = "BidConflictRetryError";
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await moderateLimiter.consume(`auction-bid:ip:${ip}`);
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

  try {
    await moderateLimiter.consume(`auction-bid:user:${session.user.id}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 8 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const raw = bodyResult.value;

  const parsed = bidSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { amount } = parsed.data;

  const MAX_RETRIES = 3;
  let placedBid:
    | {
        previousTopBidderId: string | null;
        songTitle: string;
        sellerId: string;
        endsAtIso: string;
        antiSnipeExtended: boolean;
      }
    | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const txResult = await withRouteTimeout("auction-bid-transaction", 5000, async () =>
        prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id },
          include: { song: { select: { title: true } } },
        });

        if (!auction) {
          return {
            ok: false as const,
            status: 404,
            error: "Auction not found",
          };
        }
        if (auction.status !== "ACTIVE") {
          return {
            ok: false as const,
            status: 409,
            error: "Auction is not active",
          };
        }
        if (new Date() >= auction.endsAt) {
          return {
            ok: false as const,
            status: 409,
            error: "Auction has ended",
          };
        }
        if (auction.sellerId === session.user.id) {
          return {
            ok: false as const,
            status: 403,
            error: "You cannot bid on your own auction",
          };
        }

        const minBid = getMinimumAuctionBid(
          Number(auction.startingBid),
          auction.currentBid == null ? null : Number(auction.currentBid),
        );

        if (amount < minBid) {
          return {
            ok: false as const,
            status: 400,
            error: `Bid must be at least $${minBid.toFixed(2)}`,
          };
        }

        const now = new Date();
        const msRemaining = auction.endsAt.getTime() - now.getTime();
        // Per-auction anti-snipe windows. Producers can tune these from the
        // create-auction form; legacy rows (no row exists / NULL columns)
        // fall back to the historical 2-minute default.
        const windowMs =
          (auction.antiSnipeWindowMinutes ?? DEFAULT_ANTI_SNIPE_WINDOW_MIN) *
          60 *
          1000;
        const extensionMs =
          (auction.antiSnipeExtensionMinutes ??
            DEFAULT_ANTI_SNIPE_EXTENSION_MIN) *
          60 *
          1000;
        const antiSnipeExtended = msRemaining <= windowMs;
        const nextEndsAt = antiSnipeExtended
          ? new Date(auction.endsAt.getTime() + extensionMs)
          : auction.endsAt;

        const updateRes = await tx.auction.updateMany({
          where: {
            id,
            status: "ACTIVE",
            endsAt: { gt: now },
            ...(auction.currentBid == null
              ? { currentBid: null }
              : { currentBid: auction.currentBid }),
          },
          data: {
            currentBid: amount,
            winnerId: session.user.id,
            ...(antiSnipeExtended ? { endsAt: nextEndsAt } : {}),
          },
        });

        if (updateRes.count !== 1) {
          throw new BidConflictRetryError();
        }

        await tx.auctionBid.create({
          data: { auctionId: id, bidderId: session.user.id, amount },
        });

        return {
          ok: true as const,
          previousTopBidderId: auction.winnerId ?? null,
          songTitle: auction.song.title,
          sellerId: auction.sellerId,
          endsAtIso: nextEndsAt.toISOString(),
          antiSnipeExtended,
        };
      }),
      );
      if (!txResult.ok) return txResult.response;
      const result = txResult.value;

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      placedBid = result;
      break;
    } catch (err) {
      if (err instanceof BidConflictRetryError && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  if (!placedBid) {
    return NextResponse.json(
      { error: "Another bid was placed at the same time. Please try again." },
      { status: 409 },
    );
  }

  if (
    placedBid.previousTopBidderId &&
    placedBid.previousTopBidderId !== session.user.id
  ) {
    void enqueueNotification({
      userId: placedBid.previousTopBidderId,
      type: "AUCTION_OUTBID",
      title: "You've been outbid!",
      body: `Someone placed a higher bid of $${amount.toFixed(2)} on "${placedBid.songTitle}". Bid again to stay in the lead.`,
      metadata: { auctionId: id, songTitle: placedBid.songTitle, newBid: amount },
    });
  }

  void enqueueNotification({
    userId: placedBid.sellerId,
    type: "AUCTION_BID_RECEIVED",
    title: "New bid on your auction!",
    body: `Someone bid $${amount.toFixed(2)} on "${placedBid.songTitle}".`,
    metadata: { auctionId: id, amount },
  });

  return NextResponse.json({
    success: true,
    currentBid: amount,
    endsAt: placedBid.endsAtIso,
    antiSnipeExtended: placedBid.antiSnipeExtended,
  });
}
