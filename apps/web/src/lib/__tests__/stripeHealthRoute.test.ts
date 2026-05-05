import { beforeEach, describe, expect, it, vi } from "vitest";

const getStripeHealthReportMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stripeEnv", () => ({
  getStripeHealthReport: getStripeHealthReportMock,
}));

import { GET } from "@/app/api/health/stripe/route";

describe("GET /api/health/stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 when Stripe is healthy", async () => {
    getStripeHealthReportMock.mockResolvedValue({
      envName: "production",
      isProductionLike: true,
      issues: [],
      latencyMs: 42,
      message: undefined,
      publishableKeyMode: "live",
      secretKeyMode: "live",
      status: "ok",
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.stripe.secretKeyMode).toBe("live");
  });

  it("returns 503 when Stripe configuration is unsafe", async () => {
    getStripeHealthReportMock.mockResolvedValue({
      envName: "production",
      isProductionLike: true,
      issues: [
        {
          code: "test_secret_in_production",
          message: "Production must use a live STRIPE_SECRET_KEY, not an sk_test_ key.",
          severity: "error",
        },
      ],
      message: "Production must use a live STRIPE_SECRET_KEY, not an sk_test_ key.",
      publishableKeyMode: "live",
      secretKeyMode: "test",
      status: "down",
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.stripe.issues).toHaveLength(1);
  });
});
