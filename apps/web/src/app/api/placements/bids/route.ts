import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";
import { z } from "zod";
import { checkoutMaintenanceResponse, isCheckoutMaintenanceModeEnabled } from "@/lib/payments/checkoutMaintenance";

const bidSchema = z.object({
  songId: z.string().min(1),
  amountUsd: z.number().min(25).max(10000),
  placement: z.enum(["premium_screen", "billboard", "prime_takeover"]).default("premium_screen"),
});

const SLOT_MULTIPLIER = {
  premium_screen: 1,
  billboard: 2,
  prime_takeover: 4,
} as const;

const PLACEMENT_LABEL = {
  premium_screen: "Premium Screen Bid",
  billboard: "3D Billboard Bid",
  prime_takeover: "Prime Wall Takeover Bid",
} as const;

export async function GET() {
  const songs = await prisma.song.findMany({
    where: { isActive: true, boostScore: { gt: 0 } },
    orderBy: [{ boostScore: "desc" }, { aiScore: "desc" }],
    take: 25,
    select: { id: true, title: true, artist: true, aiScore: true, boostScore: true, updatedAt: true },
  });

  return NextResponse.json({
    auction: "marketplace_wall",
    leaders: songs.map((song, index) => ({
      rank: index + 1,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      aiScore: song.aiScore,
      bidPower: song.boostScore,
      rankScore: song.aiScore + song.boostScore,
      updatedAt: song.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (isCheckoutMaintenanceModeEnabled()) {
    return checkoutMaintenanceResponse();
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bidSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid bid" }, { status: 400 });
  }

  const { songId, amountUsd, placement } = parsed.data;
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song || !song.isActive) return NextResponse.json({ error: "Song not found" }, { status: 404 });
  if (song.artistId !== session.user.id) return NextResponse.json({ error: "You can only bid with your own song." }, { status: 403 });

  const bidPower = Math.round(amountUsd * SLOT_MULTIPLIER[placement]);
  const baseUrl = getSiteUrl();

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amountUsd * 100),
          product_data: {
            name: `EMS Bid: ${PLACEMENT_LABEL[placement]}`,
            description: `${song.title} receives ${bidPower} bid power after payment confirmation.`,
          },
        },
      },
    ],
    metadata: {
      type: "PLACEMENT_BID",
      songId,
      userId: session.user.id,
      amountUsd: String(amountUsd),
      placement,
      bidPower: String(bidPower),
    },
    success_url: `${baseUrl}/marketplace?bid=success&song=${songId}`,
    cancel_url: `${baseUrl}/marketplace?bid=cancelled&song=${songId}`,
  });

  await prisma.transaction.create({
    data: {
      userId: session.user.id,
      songId,
      amount: amountUsd,
      type: "BOOST",
      status: "PENDING",
      stripeSessionId: checkout.id,
      metadata: { type: "PLACEMENT_BID", placement, bidPower, amountUsd },
    },
  });

  return NextResponse.json({ checkoutUrl: checkout.url, bid: { songId, amountUsd, placement, bidPower } }, { status: 201 });
}
