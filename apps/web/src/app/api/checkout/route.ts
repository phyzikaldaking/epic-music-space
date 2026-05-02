import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";
import { getSiteUrl } from "@/lib/site";
import { getTierLimits } from "@/lib/tierLimits";

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

  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  if (song.soldLicenses >= song.totalLicenses) {
    return NextResponse.json({ error: "Sold out" }, { status: 409 });
  }

  // Check for existing license
  const existingLicense = await prisma.licenseToken.findFirst({
    where: { songId, holderId: session.user.id, status: "ACTIVE" },
  });
  if (existingLicense) {
    return NextResponse.json(
      { error: "You already hold a license for this song." },
      { status: 409 }
    );
  }

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

  const baseUrl = getSiteUrl();

  // Create Stripe checkout session
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
            description: `Digital music license #${song.soldLicenses + 1} of ${song.totalLicenses} — ${String(song.revenueSharePct)}% revenue share per license`,
            images: song.coverUrl ? [song.coverUrl] : [],
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      songId,
      userId: session.user.id,
    },
    success_url: `${baseUrl}/track/${songId}?checkout=success`,
    cancel_url: `${baseUrl}/track/${songId}?checkout=cancelled`,
  });

  // Record pending transaction
  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      songId,
      amount: song.licensePrice,
      type: "LICENSE_PURCHASE",
      status: "PENDING",
      stripeSessionId: stripeSession.id,
    },
  });

  // Enqueue analytics
  await enqueueAnalytics({
    event: "checkout_initiated",
    userId: session.user.id,
    songId,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.redirect(stripeSession.url!, { status: 303 });
}
