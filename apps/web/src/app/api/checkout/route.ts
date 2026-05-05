import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { getTierLimits } from "@/lib/tierLimits";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";

const checkoutSchema = z.object({
  songId: z.string().cuid(),
});

export async function POST(req: NextRequest) {
  // Rate limit checkout — prevents card testing attacks
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown>;

  if (contentType.includes("application/json")) {
    body = await req.json();
  } else {
    const formData = await req.formData();
    body = Object.fromEntries(formData.entries());
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  const { songId } = parsed.data;
  const idempotencyKey = buildIdempotencyKey(req, "checkout", [
    session.user.id,
    songId,
  ]);

  // Enforce subscription tier license cap
  const buyer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionTier: true },
  });
  if (buyer) {
    const limits = getTierLimits(buyer.subscriptionTier);
    if (limits.maxLicenses < 999_999) {
      const held = await prisma.licenseToken.count({
        where: { holderId: session.user.id, status: "ACTIVE" },
      });
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
    const checkout = await createLicenseCheckoutSession({
      analytics: { event: "checkout_initiated" },
      idempotencyKey,
      quantity: 1,
      requestSource: "api/checkout",
      songId,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    return NextResponse.redirect(checkout.checkoutUrl, { status: 303 });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
