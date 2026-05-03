import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { strictLimiter } from "@/lib/rateLimit";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { getSiteUrl } from "@/lib/site";
import { getResaleSplit } from "@/lib/beatMarket";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/resales/:id/checkout
 * Creates a Stripe checkout session for a resale listing.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const listing = await prisma.resaleListing.findUnique({
    where: { id },
    include: {
      song: { select: { id: true, title: true, artist: true, coverUrl: true, artistId: true } },
      licenseToken: { select: { id: true, holderId: true } },
    },
  });

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.status !== "ACTIVE") {
    return NextResponse.json({ error: "Listing is not active" }, { status: 409 });
  }
  if (listing.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot buy your own listing" }, { status: 403 });
  }
  if (listing.licenseToken.holderId !== listing.sellerId) {
    return NextResponse.json(
      { error: "Listing is no longer valid" },
      { status: 409 },
    );
  }

  const resalePrice = Number(listing.resalePrice);
  const idempotencyKey = buildIdempotencyKey(req, "resale-checkout", [
    session.user.id,
    listing.id,
  ]);

  const split = getResaleSplit(resalePrice);
  const baseUrl = getSiteUrl();

  const stripeSession = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(resalePrice * 100),
            product_data: {
              name: `Resale License: ${listing.song.title} by ${listing.song.artist}`,
              description: `Secondary market license purchase. Platform fee: $${split.platformFee.toFixed(2)} — Artist royalty: $${split.artistRoyalty.toFixed(2)} — Seller payout: $${split.sellerPayout.toFixed(2)}`,
              images: listing.song.coverUrl ? [listing.song.coverUrl] : [],
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "resale_purchase",
        resaleListingId: listing.id,
        licenseTokenId: listing.licenseTokenId,
        songId: listing.songId,
        userId: session.user.id,
        sellerId: listing.sellerId,
        artistId: listing.song.artistId,
        idempotencyKey,
      },
      success_url: `${baseUrl}/resales/${listing.id}?checkout=success`,
      cancel_url: `${baseUrl}/resales/${listing.id}?checkout=cancelled`,
    },
    { idempotencyKey },
  );

  try {
    await prisma.transaction.create({
      data: {
        userId: session.user.id,
        songId: listing.song.id,
        amount: listing.resalePrice,
        type: "RESALE_PURCHASE",
        status: "PENDING",
        stripeSessionId: stripeSession.id,
        metadata: { resaleListingId: listing.id, idempotencyKey },
      },
    });
  } catch (error) {
    const known = error as { code?: string };
    if (known.code !== "P2002") throw error;
  }

  return NextResponse.json({ checkoutUrl: stripeSession.url }, { status: 201 });
}

