import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { strictLimiter } from "@/lib/rateLimit";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { retry, withCircuitBreaker, withTimeout } from "@/lib/resilience";
import { z } from "zod";

const placementSchema = z.object({
  songId: z.string().min(1),
  packageId: z.enum(["premium_screen", "billboard", "prime_takeover"]),
});

const PACKAGES = {
  premium_screen: { label: "Premium 3D Screen", priceUsd: 49, boostScore: 35, days: 7 },
  billboard: { label: "3D Billboard Placement", priceUsd: 149, boostScore: 90, days: 7 },
  prime_takeover: { label: "Prime Wall Takeover", priceUsd: 299, boostScore: 220, days: 3 },
} as const;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  try {
    await strictLimiter.consume(ip);
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = placementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid placement request" }, { status: 400 });

  const { songId, packageId } = parsed.data;
  const pkg = PACKAGES[packageId];
  const idempotencyKey = buildIdempotencyKey(req, "placement-checkout", [
    session.user.id,
    songId,
    packageId,
  ]);

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (song.artistId !== session.user.id) return NextResponse.json({ error: "You can only promote your own song." }, { status: 403 });

  const baseUrl = getSiteUrl();
  const checkout = await withCircuitBreaker(
    "stripe.checkout.sessions.create",
    () =>
      retry(
        () =>
          withTimeout(
            () =>
              stripe.checkout.sessions.create(
            {
              mode: "payment",
              payment_method_types: ["card"],
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: "usd",
                    unit_amount: pkg.priceUsd * 100,
                    product_data: {
                      name: `EMS Placement: ${pkg.label}`,
                      description: `${pkg.days} days of marketplace visibility for ${song.title}`,
                    },
                  },
                },
              ],
              metadata: {
                type: "PLACEMENT_PURCHASE",
                songId,
                userId: session.user.id,
                packageId,
                boostScore: String(pkg.boostScore),
                durationDays: String(pkg.days),
                idempotencyKey,
              },
              success_url: `${baseUrl}/marketplace?placement=success&song=${songId}`,
              cancel_url: `${baseUrl}/marketplace?placement=cancelled&song=${songId}`,
            },
              { idempotencyKey },
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
        userId: session.user.id,
        songId,
        amount: pkg.priceUsd,
        type: "BOOST",
        status: "PENDING",
        stripeSessionId: checkout.id,
        metadata: {
          type: "PLACEMENT_PURCHASE",
          packageId,
          boostScore: pkg.boostScore,
          durationDays: pkg.days,
          idempotencyKey,
        },
      },
    });
  } catch (error) {
    const known = error as { code?: string };
    if (known.code !== "P2002") throw error;
  }

  return NextResponse.json({ checkoutUrl: checkout.url, package: pkg }, { status: 201 });
}
