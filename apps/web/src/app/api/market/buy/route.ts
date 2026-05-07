import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { getTierLimits } from "@/lib/tierLimits";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

const buySchema = z.object({
  songId: z.string().min(1, "songId is required"),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
});

/**
 * POST /api/market/buy
 *
 * Creates a Stripe Checkout session for purchasing one or more song licenses.
 * Returns { checkoutUrl } on success — the caller should redirect the user there.
 *
 * Auth: ****** required.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`market-buy:user:${session.user.id}`);
    await strictLimiter.consume(`market-buy:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // ── Validate body ──────────────────────────────────────────────────────────
  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 16 * 1024,
    invalidMessage: "Invalid JSON body",
  });
  if (!bodyResult.ok) return bodyResult.response;

  const rawBody = bodyResult.value;

  const parsed = buySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { songId, quantity } = parsed.data;
  const idempotencyKey = buildIdempotencyKey(req, "market-buy", [
    session.user.id,
    songId,
    quantity,
  ]);

  // ── Tier license limit check ───────────────────────────────────────────────
  const buyerLookup = await withRouteTimeout("market-buy-buyer-lookup", 2500, async () =>
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
  );
  if (!buyerLookup.ok) return buyerLookup.response;
  const buyer = buyerLookup.value;
  if (buyer) {
    const limits = getTierLimits(buyer.subscriptionTier);
    const heldLookup = await withRouteTimeout("market-buy-license-count", 2500, async () =>
      prisma.licenseToken.count({
        where: { holderId: session.user.id, status: "ACTIVE" },
      }),
    );
    if (!heldLookup.ok) return heldLookup.response;
    const held = heldLookup.value;
    if (held + quantity > limits.maxLicenses) {
      return NextResponse.json(
        { error: `Your ${buyer.subscriptionTier} plan allows ${limits.maxLicenses} active license(s). Upgrade to buy more.` },
        { status: 403 }
      );
    }
  }

  try {
    const checkoutResult = await withRouteTimeout("market-buy-create-checkout", 4500, async () =>
      createLicenseCheckoutSession({
        analytics: {
          event: "market_buy_initiated",
          firstPurchaseFunnelEvent: "funnel_buyer_visit_to_first_license_purchase",
        },
        idempotencyKey,
        quantity,
        requestSource: "api/market/buy",
        songId,
        userId: session.user.id,
        userEmail: session.user.email,
      }),
    );
    if (!checkoutResult.ok) return checkoutResult.response;

    const checkout = checkoutResult.value;
    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
