import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";

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

  // ── Validate body ──────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = buySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { songId, quantity } = parsed.data;

  // ── Fetch song ─────────────────────────────────────────────────────────────
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  // ── Availability check ─────────────────────────────────────────────────────
  const available = song.totalLicenses - song.soldLicenses;
  if (available <= 0) {
    return NextResponse.json({ error: "This song is sold out" }, { status: 409 });
  }
  if (quantity > available) {
    return NextResponse.json(
      { error: `Only ${available} license(s) available` },
      { status: 409 }
    );
  }

  // ── Duplicate ownership check (one active license per user per song) ───────
  if (quantity === 1) {
    const existing = await prisma.licenseToken.findFirst({
      where: { songId, holderId: session.user.id, status: "ACTIVE" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already hold a license for this song" },
        { status: 409 }
      );
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Create Stripe checkout session ─────────────────────────────────────────
  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(song.licensePrice) * 100),
          product_data: {
            name: `License: ${song.title} by ${song.artist}`,
            description: `Digital music license — ${String(song.revenueSharePct)}% revenue share per license`,
            images: song.coverUrl ? [song.coverUrl] : [],
          },
        },
        quantity,
      },
    ],
    metadata: { songId, userId: session.user.id, quantity: String(quantity) },
    success_url: `${baseUrl}/studio/${songId}?checkout=success`,
    cancel_url: `${baseUrl}/studio/${songId}?checkout=cancelled`,
  });

  // ── Record pending transaction ─────────────────────────────────────────────
  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      songId,
      amount: Number(song.licensePrice) * quantity,
      type: "LICENSE_PURCHASE",
      status: "PENDING",
      stripeSessionId: stripeSession.id,
      metadata: { quantity },
    },
  });

  // ── Analytics ──────────────────────────────────────────────────────────────
  await enqueueAnalytics({
    event: "market_buy_initiated",
    userId: session.user.id,
    songId,
    metadata: { quantity },
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({ checkoutUrl: stripeSession.url }, { status: 201 });
}
