import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { getTierLimits } from "@/lib/tierLimits";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

const checkoutSchema = z.object({
  songId: z.string().cuid(),
  // Optional license tier id. When omitted, the buyer gets the base
  // licensePrice (Basic tier) — preserves the legacy single-tier flow.
  licenseTierId: z.string().min(1).max(40).optional(),
});

export async function POST(req: NextRequest) {
  // Rate limit checkout — prevents card testing attacks
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`checkout:user:${session.user.id}`);
    await strictLimiter.consume(`checkout:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 32 * 1024) {
    return NextResponse.json(
      { error: "Payload too large (max 32768 bytes)" },
      { status: 413 },
    );
  }
  let body: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
      maxBytes: 32 * 1024,
      invalidMessage: "Invalid JSON body",
    });
    if (!bodyResult.ok) return bodyResult.response;
    body = bodyResult.value;
  } else {
    const formData = await req.formData();
    body = Object.fromEntries(formData.entries());
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  const { songId, licenseTierId } = parsed.data;
  const idempotencyKey = buildIdempotencyKey(req, "checkout", [
    session.user.id,
    songId,
    licenseTierId ?? "base",
  ]);

  // Enforce subscription tier license cap
  const buyerLookup = await withRouteTimeout("checkout-buyer-lookup", 2500, async () =>
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionTier: true },
    }),
  );
  if (!buyerLookup.ok) return buyerLookup.response;
  const buyer = buyerLookup.value;
  if (buyer) {
    const limits = getTierLimits(buyer.subscriptionTier);
    if (limits.maxLicenses < 999_999) {
      const heldLookup = await withRouteTimeout("checkout-license-count", 2500, async () =>
        prisma.licenseToken.count({
          where: { holderId: session.user.id, status: "ACTIVE" },
        }),
      );
      if (!heldLookup.ok) return heldLookup.response;
      const held = heldLookup.value;
      if (held >= limits.maxLicenses) {
        return NextResponse.json(
          {
            error: `You've reached your ${limits.maxLicenses}-license limit on the ${buyer.subscriptionTier.replace("_TIER", "")} plan. Upgrade at /pricing.`,
          },
          { status: 403 }
        );
      }
    }
  }

  try {
    const checkoutResult = await withRouteTimeout("checkout-create", 4500, async () =>
      createLicenseCheckoutSession({
        analytics: { event: "checkout_initiated" },
        idempotencyKey,
        quantity: 1,
        requestSource: "api/checkout",
        songId,
        userId: session.user.id,
        userEmail: session.user.email,
        licenseTierId,
      }),
    );
    if (!checkoutResult.ok) return checkoutResult.response;

    const checkout = checkoutResult.value;
    return NextResponse.redirect(checkout.checkoutUrl, { status: 303 });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
