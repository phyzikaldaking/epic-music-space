import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { strictLimiter, lenientLimiter } from "@/lib/rateLimit";
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from "@/lib/redis";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { createLicenseCheckoutSession, LicenseCheckoutError } from "@/lib/payments/licenseCheckout";
import { checkoutMaintenanceResponse, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

// ─────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────

const buySchema = z.object({
  songId: z.string().min(1, "songId is required"),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
});

// ─────────────────────────────────────────────────────────
// GET /api/market/listings
// Returns all active song listings that still have licenses available.
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await lenientLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // Try Redis cache first
  const cacheKey = CACHE_KEYS.listings;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const allActive = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: [{ aiScore: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      artist: true,
      genre: true,
      coverUrl: true,
      licensePrice: true,
      revenueSharePct: true,
      totalLicenses: true,
      soldLicenses: true,
      aiScore: true,
      district: true,
      versusWins: true,
      createdAt: true,
    },
    take: 200,
  });

  const result = allActive
    .filter((s) => s.soldLicenses < s.totalLicenses)
    .slice(0, 100)
    .map((s) => ({
      ...s,
      availableLicenses: s.totalLicenses - s.soldLicenses,
      licensePrice: Number(s.licensePrice),
      revenueSharePct: Number(s.revenueSharePct),
    }));

  await cacheSet(cacheKey, result, CACHE_TTL.listings);
  return NextResponse.json(result);
}

// ─────────────────────────────────────────────────────────
// POST /api/market/buy
// Creates a Stripe Checkout session to purchase one or more licenses.
// ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

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

  const body = await req.json();
  const parsed = buySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { songId, quantity } = parsed.data;
  const idempotencyKey = buildIdempotencyKey(req, "market-route-checkout", [
    session.user.id,
    songId,
    quantity,
  ]);

  try {
    const checkout = await createLicenseCheckoutSession({
      analytics: { event: "market_buy_initiated" },
      idempotencyKey,
      quantity,
      requestSource: "api/market",
      songId,
      userId: session.user.id,
      userEmail: session.user.email,
    });
    return NextResponse.json({ checkoutUrl: checkout.checkoutUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof LicenseCheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
