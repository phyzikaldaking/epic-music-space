import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const consumeMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const stripeCheckoutCreateMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  auction: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  auctionBid: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  transaction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  auction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rateLimit", () => ({
  moderateLimiter: { consume: consumeMock },
}));
vi.mock("@/lib/queues", () => ({ enqueueNotification: enqueueMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/site", () => ({ getSiteUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: stripeCheckoutCreateMock,
      },
    },
  },
}));

import { POST as placeBid } from "@/app/api/auctions/[id]/bid/route";
import { GET as settleAuctions } from "@/app/api/cron/settle-auctions/route";

describe("auction route hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", role: "ARTIST" } });
    consumeMock.mockResolvedValue(undefined);
    enqueueMock.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
  });

  it("extends end time for anti-sniping when bid is inside final window", async () => {
    const endsAt = new Date(Date.now() + 60 * 1000);
    txMock.auction.findUnique.mockResolvedValue({
      id: "auction-1",
      status: "ACTIVE",
      endsAt,
      sellerId: "seller-1",
      winnerId: null,
      startingBid: 10,
      currentBid: 12,
      song: { title: "Track A" },
    });
    txMock.auction.updateMany.mockResolvedValue({ count: 1 });
    txMock.auctionBid.create.mockResolvedValue({ id: "bid-1" });

    const req = new NextRequest("http://localhost/api/auctions/auction-1/bid", {
      method: "POST",
      body: JSON.stringify({ amount: 12.5 }),
      headers: { "content-type": "application/json" },
    });

    const res = await placeBid(req, { params: Promise.resolve({ id: "auction-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.antiSnipeExtended).toBe(true);
    expect(txMock.auction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          endsAt: expect.any(Date),
        }),
      }),
    );
  });

  it("retries queued failed checkout creation and reopens pending payment session", async () => {
    process.env.CRON_SECRET = "test-secret";

    prismaMock.transaction.findMany.mockResolvedValue([
      {
        id: "tx-failed-1",
        userId: "winner-1",
        amount: 55,
        metadata: {
          auctionId: "auction-1",
          sellerId: "seller-1",
          retryState: "CHECKOUT_CREATE_FAILED",
          retryAfter: new Date(Date.now() - 60_000).toISOString(),
          retryCount: 1,
        },
      },
    ]);
    prismaMock.transaction.findFirst.mockResolvedValue(null);
    prismaMock.auction.findUnique.mockResolvedValue({
      id: "auction-1",
      sellerId: "seller-1",
      winnerId: "winner-1",
      status: "ENDED",
      song: {
        id: "song-1",
        title: "Track A",
        artist: "Artist A",
        coverUrl: null,
      },
    });
    stripeCheckoutCreateMock.mockResolvedValue({
      id: "cs_retry_1",
      url: "https://checkout.stripe.com/cs_retry_1",
    });
    prismaMock.transaction.update.mockResolvedValue({ id: "tx-failed-1" });
    prismaMock.auction.findMany.mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/cron/settle-auctions", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });

    const res = await settleAuctions(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.retried).toBe(1);
    expect(stripeCheckoutCreateMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-failed-1" },
        data: expect.objectContaining({
          status: "PENDING",
          stripeSessionId: "cs_retry_1",
        }),
      }),
    );
  });
});
