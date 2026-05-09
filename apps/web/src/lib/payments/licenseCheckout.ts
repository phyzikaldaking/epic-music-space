import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { getTierLimits } from "@/lib/tierLimits";
import { enqueueAnalytics } from "@/lib/queues";
import { track } from "@/lib/analytics";
import { fireAndForget, retry, withCircuitBreaker, withTimeout } from "@/lib/resilience";
import { computeRiskScore } from "@/lib/riskScore";

export class LicenseCheckoutError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LicenseCheckoutError";
  }
}

type LicenseCheckoutAnalytics = {
  event: string;
  firstPurchaseFunnelEvent?: string;
};

type CreateLicenseCheckoutInput = {
  idempotencyKey: string;
  quantity: number;
  requestSource: string;
  songId: string;
  userId: string;
  userEmail?: string | null;
  analytics: LicenseCheckoutAnalytics;
  // Optional tier id from Song.licenseVariants. When provided, the tier's
  // priceUsd overrides the base licensePrice on the Stripe line item and
  // the tier's totalLicenses cap (if set) is enforced separately.
  licenseTierId?: string;
  // Pay-what-you-want amount in USD. Honored only when the song has
  // payWhatYouWant=true; if set on a fixed-price song, we ignore it and
  // use the listed price (silent ignore beats a confusing 4xx for the
  // legitimate case where the client is older than the schema). Floor
  // check happens against song.licensePrice.
  customAmount?: number;
};

type LicenseVariantShape = {
  id: string;
  name: string;
  priceUsd: number;
  terms?: string;
  totalLicenses?: number;
};

export type LicenseCheckoutResult = {
  checkoutUrl: string;
  sessionId: string;
};

export async function createLicenseCheckoutSession(
  input: CreateLicenseCheckoutInput,
): Promise<LicenseCheckoutResult> {
  const buyer = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { subscriptionTier: true },
  });

  if (buyer) {
    const limits = getTierLimits(buyer.subscriptionTier);
    const held = await prisma.licenseToken.count({
      where: { holderId: input.userId, status: "ACTIVE" },
    });

    if (held + input.quantity > limits.maxLicenses) {
      throw new LicenseCheckoutError(
        `Your ${buyer.subscriptionTier} plan allows ${limits.maxLicenses} active license(s). Upgrade to buy more.`,
        403,
      );
    }
  }

  const activeLicensesCount = await prisma.licenseToken.count({
    where: { holderId: input.userId, status: "ACTIVE" },
  });

  const song = await prisma.song.findUnique({ where: { id: input.songId } });
  if (!song || !song.isActive) {
    throw new LicenseCheckoutError("Song not found", 404);
  }

  // Tier resolution. If the buyer picked a tier, find it in the song's
  // licenseVariants JSON and use its price + name. A tier id that doesn't
  // exist (stale UI, manipulated request) gets a 404 — never silently fall
  // back to the base price, since the buyer clicked a specific button.
  const variants = (song.licenseVariants ?? null) as LicenseVariantShape[] | null;
  const selectedTier =
    input.licenseTierId && Array.isArray(variants)
      ? variants.find((v) => v?.id === input.licenseTierId) ?? null
      : null;
  if (input.licenseTierId && !selectedTier) {
    throw new LicenseCheckoutError("License tier not available", 404);
  }
  // Resolve the unit price. Order of precedence:
  //   1. Selected tier (the buyer clicked a specific tier button)
  //   2. Pay-what-you-want amount (only when song.payWhatYouWant=true)
  //   3. Base song.licensePrice
  //
  // PWYW + a tier id is not allowed by the UI, but if it ever happens we
  // honor the tier (explicit click wins). The floor check uses the song's
  // base licensePrice as the minimum a fan can contribute.
  const songFloorUsd = Number(song.licensePrice);
  let unitPriceUsd: number;
  let pricingMode: "tier" | "pwyw" | "fixed";
  if (selectedTier) {
    unitPriceUsd = Number(selectedTier.priceUsd);
    pricingMode = "tier";
  } else if (song.payWhatYouWant && typeof input.customAmount === "number") {
    if (!Number.isFinite(input.customAmount) || input.customAmount < songFloorUsd) {
      throw new LicenseCheckoutError(
        `Minimum contribution is $${songFloorUsd.toFixed(2)}.`,
        400,
      );
    }
    // Cap at $50,000 per transaction as a defense-in-depth limit. The
    // route-level zod also enforces this; duplicating here protects any
    // future caller that doesn't go through /api/checkout.
    unitPriceUsd = Math.min(input.customAmount, 50_000);
    pricingMode = "pwyw";
  } else {
    unitPriceUsd = songFloorUsd;
    pricingMode = "fixed";
  }
  const productName = selectedTier
    ? `License (${selectedTier.name}): ${song.title} by ${song.artist}`
    : pricingMode === "pwyw"
      ? `License (Fan-set price): ${song.title} by ${song.artist}`
      : `License: ${song.title} by ${song.artist}`;

  const checkoutAmountUsd = unitPriceUsd * input.quantity;
  const risk = await computeRiskScore(input.userId, {
    action: "CHECKOUT",
    checkoutAmountUsd,
  });
  if (risk.blocked || risk.level === "HIGH") {
    throw new LicenseCheckoutError(
      `Checkout blocked by fraud safeguards (${risk.reasons.join(", ") || "risk-high"}).`,
      403,
    );
  }

  const available = song.totalLicenses - song.soldLicenses;
  if (available <= 0) {
    throw new LicenseCheckoutError("This song is sold out", 409);
  }
  if (input.quantity > available) {
    throw new LicenseCheckoutError(`Only ${available} license(s) available`, 409);
  }

  if (input.quantity === 1) {
    const existing = await prisma.licenseToken.findFirst({
      where: { songId: input.songId, holderId: input.userId, status: "ACTIVE" },
    });
    if (existing) {
      throw new LicenseCheckoutError("You already hold a license for this song", 409);
    }
  }

  const baseUrl = getSiteUrl();

  const checkoutSession = await withCircuitBreaker(
    "stripe.checkout.sessions.create",
    () =>
      retry(
        () =>
          withTimeout(
            () =>
              stripe.checkout.sessions.create(
                {
                  mode: "payment",
                  // Cash App Pay is a Stripe-supported method for USD
                  // checkouts and lets fans pay from their Cash App
                  // balance / linked bank. Card stays the default; the
                  // hosted checkout shows both wallets side-by-side.
                  payment_method_types: ["card", "cashapp"],
                  line_items: [
                    {
                      price_data: {
                        currency: "usd",
                        unit_amount: Math.round(unitPriceUsd * 100),
                        product_data: {
                          name: productName,
                          description:
                            (selectedTier?.terms
                              ? `${selectedTier.terms} · `
                              : "") +
                            `Digital music license — ${String(song.revenueSharePct)}% revenue share per license`,
                          images: song.coverUrl ? [song.coverUrl] : [],
                        },
                      },
                      quantity: input.quantity,
                    },
                  ],
                  ...(input.userEmail ? { customer_email: input.userEmail } : {}),
                  metadata: {
                    type: "license_purchase",
                    songId: input.songId,
                    userId: input.userId,
                    quantity: String(input.quantity),
                    idempotencyKey: input.idempotencyKey,
                    checkoutSource: input.requestSource,
                    ...(selectedTier
                      ? {
                          licenseTierId: selectedTier.id,
                          licenseTierName: selectedTier.name,
                        }
                      : {}),
                  },
                  success_url: `${baseUrl}/track/${input.songId}?checkout=success${
                    input.requestSource === "api/stripe/checkout"
                      ? "&session_id={CHECKOUT_SESSION_ID}"
                      : ""
                  }`,
                  cancel_url: `${baseUrl}/track/${input.songId}?checkout=cancelled`,
                },
                { idempotencyKey: input.idempotencyKey },
              ),
            8000,
            "stripe.checkout.sessions.create",
          ),
        { retries: 1, baseDelayMs: 300 },
      ),
    { failureThreshold: 4, cooldownMs: 15_000 },
  );

  try {
    await prisma.transaction.create({
      data: {
        userId: input.userId,
        songId: input.songId,
        amount: unitPriceUsd * input.quantity,
        currency: "usd",
        type: "LICENSE_PURCHASE",
        status: "PENDING",
        stripeSessionId: checkoutSession.id,
        metadata: {
          quantity: input.quantity,
          idempotencyKey: input.idempotencyKey,
          checkoutSource: input.requestSource,
          ...(selectedTier
            ? {
                licenseTierId: selectedTier.id,
                licenseTierName: selectedTier.name,
              }
            : {}),
        },
      },
    });
  } catch (error) {
    const known = error as { code?: string };
    if (known.code !== "P2002") throw error;
  }

  fireAndForget(
    enqueueAnalytics({
      event: input.analytics.event,
      userId: input.userId,
      songId: input.songId,
      metadata: { quantity: input.quantity, idempotencyKey: input.idempotencyKey },
      timestamp: new Date().toISOString(),
    }),
    `enqueueAnalytics ${input.analytics.event}`,
  );

  if (activeLicensesCount === 0 && input.analytics.firstPurchaseFunnelEvent) {
    fireAndForget(
      Promise.resolve(
        track({
          event: input.analytics.firstPurchaseFunnelEvent,
          userId: input.userId,
          properties: {
            songId: input.songId,
            quantity: input.quantity,
          },
        }),
      ),
      `track ${input.analytics.firstPurchaseFunnelEvent}`,
    );
  }

  if (!checkoutSession.url) {
    throw new Error("Stripe checkout session did not return a URL");
  }

  return {
    checkoutUrl: checkoutSession.url,
    sessionId: checkoutSession.id,
  };
}
