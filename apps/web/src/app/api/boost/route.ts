import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";

// ─────────────────────────────────────────────────────────
// Boost package definitions
// ─────────────────────────────────────────────────────────

export const BOOST_PACKAGES = {
  plays_1k: {
    id: "plays_1k",
    label: "1,000 Plays",
    description: "Drive 1,000 targeted plays to your track",
    priceUsd: 10,
    boostPoints: 5,
    durationDays: 7,
  },
  trending: {
    id: "trending",
    label: "Trending Boost",
    description: "Feature your track in the Trending section for 3 days",
    priceUsd: 25,
    boostPoints: 15,
    durationDays: 3,
  },
  city_spotlight: {
    id: "city_spotlight",
    label: "City Spotlight",
    description: "Premium city map billboard placement for 7 days",
    priceUsd: 75,
    boostPoints: 40,
    durationDays: 7,
  },
} as const;

export type BoostPackageId = keyof typeof BOOST_PACKAGES;

const boostSchema = z.object({
  songId: z.string().min(1, "songId is required"),
  packageId: z.enum(["plays_1k", "trending", "city_spotlight"]),
});

/**
 * GET /api/boost
 *
 * Returns available boost packages.
 */
export async function GET() {
  return NextResponse.json(Object.values(BOOST_PACKAGES));
}

/**
 * POST /api/boost
 *
 * Creates a Stripe Checkout session for a boost package purchase.
 *
 * Body (JSON):
 *   songId     — the song to boost
 *   packageId  — one of "plays_1k" | "trending" | "city_spotlight"
 *
 * Returns { checkoutUrl: string } (201).
 *
 * Auth: required. Caller must own the song.
 */
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
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = boostSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { songId, packageId } = parsed.data;
  const pkg = BOOST_PACKAGES[packageId];

  // Verify song exists and caller owns it
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  if (song.artistId !== session.user.id) {
    return NextResponse.json(
      { error: "You can only boost your own songs." },
      { status: 403 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Create Stripe checkout session for the boost
  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pkg.priceUsd * 100,
          product_data: {
            name: `EMS Boost: ${pkg.label}`,
            description: pkg.description,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "boost",
      songId,
      userId: session.user.id,
      packageId,
      boostPoints: String(pkg.boostPoints),
    },
    success_url: `${baseUrl}/boost?success=1&song=${songId}`,
    cancel_url: `${baseUrl}/boost?cancelled=1`,
  });

  // Record pending transaction
  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      songId,
      amount: pkg.priceUsd,
      type: "REVENUE_PAYOUT", // reusing enum; semantically a "platform spend"
      status: "PENDING",
      stripeSessionId: stripeSession.id,
      metadata: { type: "boost", packageId, boostPoints: pkg.boostPoints },
    },
  });

  await enqueueAnalytics({
    event: "boost_checkout_created",
    userId: session.user.id,
    songId,
    metadata: { packageId },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ checkoutUrl: stripeSession.url }, { status: 201 });
}
