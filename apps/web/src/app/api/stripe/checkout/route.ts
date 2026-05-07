import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";

const checkoutSchema = z.object({
  songId: z.string().min(1),
});

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`stripe-checkout:user:${session.user.id}`);
    await strictLimiter.consume(`stripe-checkout:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<Record<string, unknown>>(request, {
    maxBytes: 16 * 1024,
  });
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = checkoutSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const idempotencyKey = buildIdempotencyKey(request, "api-stripe-checkout", [
    session.user.id,
    parsed.data.songId,
    1,
  ]);

  try {
    const checkoutResult = await withRouteTimeout("stripe-checkout-create", 4500, async () =>
      createLicenseCheckoutSession({
        analytics: { event: "checkout_created" },
        idempotencyKey,
        quantity: 1,
        requestSource: "api/stripe/checkout",
        songId: parsed.data.songId,
        userId: session.user.id,
        userEmail: session.user.email,
      }),
    );
    if (!checkoutResult.ok) return checkoutResult.response;

    const checkout = checkoutResult.value;
    return NextResponse.json({ url: checkout.checkoutUrl });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
