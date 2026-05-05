import { describe, expect, it } from "vitest";
import { assertStripeEnvironment, validateStripeEnvironment } from "@/lib/stripeEnv";

describe("validateStripeEnvironment", () => {
  it("rejects test keys in production", () => {
    const report = validateStripeEnvironment({
      VERCEL_ENV: "production",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_PUBLISHABLE_KEY: "pk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
      STRIPE_PRICE_ID_STARTER: "price_1",
      STRIPE_PRICE_ID_PRO: "price_2",
      STRIPE_PRICE_ID_PRIME: "price_3",
      STRIPE_PRICE_ID_TEAM: "price_4",
      STRIPE_PRICE_ID_LABEL: "price_5",
    });

    expect(report.isProductionLike).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "test_secret_in_production",
        "test_publishable_in_production",
      ]),
    );
  });

  it("rejects mismatched secret and publishable key modes", () => {
    const report = validateStripeEnvironment({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_PUBLISHABLE_KEY: "pk_live_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
    });

    expect(report.issues.map((issue) => issue.code)).toContain("key_mode_mismatch");
  });

  it("warns when non-production uses live Stripe keys", () => {
    const report = validateStripeEnvironment({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "sk_live_123",
      STRIPE_PUBLISHABLE_KEY: "pk_live_123",
      STRIPE_WEBHOOK_SECRET: "whsec_123",
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "live_secret_outside_production", severity: "warning" }),
        expect.objectContaining({ code: "live_publishable_outside_production", severity: "warning" }),
      ]),
    );
  });
});

describe("assertStripeEnvironment", () => {
  it("throws for invalid production Stripe config", () => {
    expect(() =>
      assertStripeEnvironment({
        VERCEL_ENV: "production",
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_PUBLISHABLE_KEY: "pk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
        STRIPE_PRICE_ID_STARTER: "price_1",
        STRIPE_PRICE_ID_PRO: "price_2",
        STRIPE_PRICE_ID_PRIME: "price_3",
        STRIPE_PRICE_ID_TEAM: "price_4",
        STRIPE_PRICE_ID_LABEL: "price_5",
      }),
    ).toThrow(/Invalid Stripe configuration/);
  });
});
