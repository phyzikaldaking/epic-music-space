import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLicenseCheckoutSession } from "@/lib/payments/licenseCheckout";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  licenseToken: { count: vi.fn(), findFirst: vi.fn() },
  song: { findUnique: vi.fn() },
  transaction: { create: vi.fn() },
}));

const stripeCreateMock = vi.hoisted(() => vi.fn());
const enqueueAnalyticsMock = vi.hoisted(() => vi.fn());
const trackMock = vi.hoisted(() => vi.fn());
const computeRiskScoreMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: stripeCreateMock,
      },
    },
  },
}));
vi.mock("@/lib/site", () => ({ getSiteUrl: () => "https://epicmusicspace.com" }));
vi.mock("@/lib/queues", () => ({ enqueueAnalytics: enqueueAnalyticsMock }));
vi.mock("@/lib/analytics", () => ({ track: trackMock }));
vi.mock("@/lib/riskScore", () => ({
  computeRiskScore: computeRiskScoreMock,
}));
vi.mock("@/lib/resilience", () => ({
  fireAndForget: vi.fn((promise: Promise<unknown>) => promise),
  retry: vi.fn((fn: () => Promise<unknown>) => fn()),
  withCircuitBreaker: vi.fn((_name: string, fn: () => Promise<unknown>) => fn()),
  withTimeout: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

describe("createLicenseCheckoutSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ subscriptionTier: "PRO" });
    prismaMock.licenseToken.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    prismaMock.licenseToken.findFirst.mockResolvedValue(null);
    prismaMock.song.findUnique.mockResolvedValue({
      id: "song-1",
      title: "Track A",
      artist: "Artist A",
      isActive: true,
      licensePrice: 12.5,
      revenueSharePct: 70,
      coverUrl: null,
      totalLicenses: 10,
      soldLicenses: 2,
    });
    stripeCreateMock.mockResolvedValue({ id: "cs_123", url: "https://checkout.stripe.com/cs_123" });
    prismaMock.transaction.create.mockResolvedValue({ id: "tx_123" });
    enqueueAnalyticsMock.mockResolvedValue(undefined);
    trackMock.mockResolvedValue(undefined);
    computeRiskScoreMock.mockResolvedValue({
      blocked: false,
      level: "LOW",
      reasons: [],
      score: 0,
    });
  });

  it("creates a standardized checkout session and pending transaction", async () => {
    const result = await createLicenseCheckoutSession({
      analytics: {
        event: "market_buy_initiated",
        firstPurchaseFunnelEvent: "funnel_buyer_visit_to_first_license_purchase",
      },
      idempotencyKey: "checkout:test",
      quantity: 2,
      requestSource: "api/market/buy",
      songId: "song-1",
      userEmail: "buyer@example.com",
      userId: "user-1",
    });

    expect(result).toEqual({
      checkoutUrl: "https://checkout.stripe.com/cs_123",
      sessionId: "cs_123",
    });
    expect(stripeCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "buyer@example.com",
        metadata: expect.objectContaining({
          type: "license_purchase",
          songId: "song-1",
          userId: "user-1",
          quantity: "2",
          idempotencyKey: "checkout:test",
          checkoutSource: "api/market/buy",
        }),
      }),
      { idempotencyKey: "checkout:test" },
    );
    expect(prismaMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 25,
          stripeSessionId: "cs_123",
          metadata: expect.objectContaining({
            quantity: 2,
            checkoutSource: "api/market/buy",
          }),
        }),
      }),
    );
    expect(enqueueAnalyticsMock).toHaveBeenCalled();
    expect(trackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "funnel_buyer_visit_to_first_license_purchase",
      }),
    );
  });

  it("rejects duplicate ownership for single-license purchases", async () => {
    prismaMock.licenseToken.findFirst.mockResolvedValue({ id: "license-1" });

    await expect(
      createLicenseCheckoutSession({
        analytics: { event: "checkout_initiated" },
        idempotencyKey: "checkout:test",
        quantity: 1,
        requestSource: "api/checkout",
        songId: "song-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      message: "You already hold a license for this song",
      status: 409,
    });
  });

  it("blocks checkout when fraud safeguards return HIGH risk", async () => {
    computeRiskScoreMock.mockResolvedValueOnce({
      blocked: true,
      level: "HIGH",
      reasons: ["new-account", "email-unverified"],
      score: 88,
    });

    await expect(
      createLicenseCheckoutSession({
        analytics: { event: "checkout_initiated" },
        idempotencyKey: "checkout:risk",
        quantity: 1,
        requestSource: "api/checkout",
        songId: "song-1",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(stripeCreateMock).not.toHaveBeenCalled();
  });
});
