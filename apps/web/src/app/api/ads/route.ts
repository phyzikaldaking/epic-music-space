import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";
import { getSiteUrl } from "@/lib/site";

const createAdSchema = z.object({
  location: z.enum([
    "MARKETPLACE_BANNER",
    "STUDIO_SIDEBAR",
    "CITY_BILLBOARD",
    "VERSUS_BANNER",
  ]),
  title: z.string().min(1).max(100),
  mediaUrl: z.string().url(),
  linkUrl: z.string().url().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const AD_PRICES: Record<string, number> = {
  MARKETPLACE_BANNER: 99,
  STUDIO_SIDEBAR: 49,
  CITY_BILLBOARD: 199,
  VERSUS_BANNER: 79,
};

export async function GET() {
  const ads = await prisma.adPlacement.findMany({
    where: { isActive: true, endDate: { gte: new Date() } },
    include: { owner: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(ads);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createAdSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { location, title, mediaUrl, linkUrl, startDate, endDate } = parsed.data;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) {
    return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
  }

  // Calculate price based on location and duration
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const dailyRate = AD_PRICES[location] ?? 99;
  const totalPrice = dailyRate * days;

  const baseUrl = getSiteUrl();

  // Create pending ad record first so we can pass its ID to Stripe metadata
  const ad = await prisma.adPlacement.create({
    data: {
      location: location as Parameters<typeof prisma.adPlacement.create>[0]["data"]["location"],
      title,
      mediaUrl,
      linkUrl,
      ownerId: session.user.id,
      price: totalPrice,
      startDate: start,
      endDate: end,
      isActive: false, // activated after payment via webhook
    },
  });

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: totalPrice * 100,
          product_data: {
            name: `Ad Placement: ${location.replace(/_/g, " ")}`,
            description: `${days} day(s) at ${title}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "AD_PURCHASE",
      adId: ad.id,
      userId: session.user.id,
    },
    success_url: `${baseUrl}/ads?purchased=true`,
    cancel_url: `${baseUrl}/ads`,
  });

  return NextResponse.json({ checkoutUrl: stripeSession.url, adId: ad.id }, { status: 201 });
}
