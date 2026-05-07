import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const moderateConsumeMock = vi.hoisted(() => vi.fn());
const strictConsumeMock = vi.hoisted(() => vi.fn());
const rateLimitInlineMock = vi.hoisted(() => vi.fn());
const stripeCheckoutCreateMock = vi.hoisted(() => vi.fn());
const stripeTransfersCreateMock = vi.hoisted(() => vi.fn());
const getCreatorWalletSummaryMock = vi.hoisted(() => vi.fn());
const computeRiskScoreMock = vi.hoisted(() => vi.fn());

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  serviceListing: {
    findUnique: vi.fn(),
  },
  serviceOrder: {
    create: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
  },
  payout: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rateLimit", () => ({
  moderateLimiter: { consume: moderateConsumeMock },
  strictLimiter: { consume: strictConsumeMock },
}));
vi.mock("@/lib/rateLimitInline", () => ({ rateLimit: rateLimitInlineMock }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: stripeCheckoutCreateMock } },
    transfers: { create: stripeTransfersCreateMock },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/site", () => ({ getSiteUrl: () => "http://localhost:3000" }));
vi.mock("@/lib/wallet", () => ({ getCreatorWalletSummary: getCreatorWalletSummaryMock }));
vi.mock("@/lib/riskScore", () => ({
  computeRiskScore: computeRiskScoreMock,
  riskBlockResponse: () => ({ blocked: true }),
}));

vi.mock("@/lib/apiHardening", () => ({
  readJsonBodyLimited: async <T>(req: Request) => {
    const text = await req.text();
    return { ok: true, value: JSON.parse(text) as T };
  },
  withRouteTimeout: async <T>(_label: string, _timeoutMs: number, operation: () => Promise<T>) => {
    const value = await operation();
    return { ok: true, value };
  },
}));

import { POST as tipsCheckout } from "@/app/api/tips/route";
import { POST as serviceCheckout } from "@/app/api/services/[id]/checkout/route";
import { POST as payoutRequest } from "@/app/api/payout/request/route";

describe("payment route idempotency propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1", role: "ARTIST" } });
    moderateConsumeMock.mockResolvedValue(undefined);
    strictConsumeMock.mockResolvedValue(undefined);
    rateLimitInlineMock.mockResolvedValue(null);

    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-1", name: "Artist", username: "artist" });
    prismaMock.serviceListing.findUnique.mockResolvedValue({
      id: "service-1",
      title: "Mix + Master",
      priceUsd: 150,
      status: "LIVE",
      providerId: "provider-1",
      coverUrl: null,
    });
    prismaMock.serviceOrder.create.mockResolvedValue({ id: "order-1" });
    prismaMock.serviceOrder.update.mockResolvedValue({ id: "order-1" });
    prismaMock.transaction.create.mockResolvedValue({ id: "tx-1" });
    prismaMock.payout.create.mockResolvedValue({ id: "payout-1" });

    stripeCheckoutCreateMock.mockResolvedValue({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" });
    stripeTransfersCreateMock.mockResolvedValue({ id: "tr_123" });

    getCreatorWalletSummaryMock.mockResolvedValue({ payoutReady: true, availableBalance: 42.75 });
    computeRiskScoreMock.mockResolvedValue({ blocked: false, level: "LOW", reasons: [] });
  });

  it("passes idempotency key to Stripe tip checkout", async () => {
    const req = new NextRequest("http://localhost/api/tips", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "tip-test-123",
      },
      body: JSON.stringify({ artistId: "artist-1", amount: 5, message: "great" }),
    });

    const res = await tipsCheckout(req);
    expect(res.status).toBe(201);
    expect(stripeCheckoutCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^tips-checkout:[a-f0-9]{32}$/),
      }),
    );
  });

  it("passes idempotency key to Stripe service checkout", async () => {
    const req = new Request("http://localhost/api/services/service-1/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "service-test-123",
      },
      body: JSON.stringify({ brief: "Need a clean mix" }),
    });

    const res = await serviceCheckout(req, { params: Promise.resolve({ id: "service-1" }) });
    expect(res.status).toBe(200);
    expect(stripeCheckoutCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^service-checkout:[a-f0-9]{32}$/),
      }),
    );
  });

  it("passes idempotency key to Stripe payout transfer", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      stripeConnectId: "acct_123",
      songs: [{ id: "song-1" }],
    });

    const req = new NextRequest("http://localhost/api/payout/request", {
      method: "POST",
      headers: {
        "idempotency-key": "payout-test-123",
      },
    });

    const res = await payoutRequest(req);
    expect(res.status).toBe(200);
    expect(stripeTransfersCreateMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^payout-request:[a-f0-9]{32}$/),
      }),
    );
  });
});
