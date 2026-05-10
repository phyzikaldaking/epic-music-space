import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { checkoutMaintenanceResponse, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

const checkoutSchema = z.object({
  songId: z.string().min(1, "songId is required"),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
});

/**
 * POST /api/payments/create-checkout
 *
 * Creates a Stripe Checkout session for purchasing song licenses.
 *
 * Body (JSON):
 *   songId   — cuid of the song to license
 *   quantity — number of licenses to purchase (default 1, max 100)
 *
 * Returns { checkoutUrl: string } (201) — the caller should redirect to this URL.
 *
 * Auth: required.
 */
export async function POST(req: NextRequest) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`payments-checkout:user:${session.user.id}`);
    await strictLimiter.consume(`payments-checkout:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(req, {
    maxBytes: 16 * 1024,
    invalidMessage: "Invalid JSON body",
  });
  if (!bodyResult.ok) return bodyResult.response;

  const rawBody = bodyResult.value;

  const parsed = checkoutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { songId, quantity } = parsed.data;
  const idempotencyKey = buildIdempotencyKey(req, "payments-checkout", [
    session.user.id,
    songId,
    quantity,
  ]);

  try {
    const checkoutResult = await withRouteTimeout("payments-create-checkout", 4500, async () =>
      createLicenseCheckoutSession({
        analytics: { event: "checkout_created" },
        idempotencyKey,
        quantity,
        requestSource: "api/payments/create-checkout",
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
