import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/site";

const checkoutSchema = z.object({
  songId: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
  }

  const song = await prisma.song.findUnique({
    where: { id: parsed.data.songId },
    include: { artist_: true },
  });

  if (!song || !song.isActive) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  if (song.soldLicenses >= song.totalLicenses) {
    return NextResponse.json({ error: "This track is sold out" }, { status: 409 });
  }

  const siteUrl = getSiteUrl();
  const amountCents = Math.round(Number(song.licensePrice) * 100);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return NextResponse.json({ error: "Invalid license price" }, { status: 400 });
  }

  const transaction = await prisma.transaction.create({
    data: {
      amount: song.licensePrice,
      currency: "usd",
      type: "LICENSE_PURCHASE",
      status: "PENDING",
      userId: session.user.id,
      songId: song.id,
      metadata: {
        artistId: song.artistId,
        artistStripeConnectId: song.artist_.stripeConnectId,
        revenueSharePct: song.revenueSharePct.toString(),
      },
    },
  });

  const stripeSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `${song.title} License`,
            description: `${song.artist} · Epic Music Space license`,
            images: song.coverUrl ? [song.coverUrl] : undefined,
            metadata: {
              songId: song.id,
              artistId: song.artistId,
            },
          },
        },
      },
    ],
    customer_email: session.user.email ?? undefined,
    success_url: `${siteUrl}/track/${song.id}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/track/${song.id}?checkout=cancelled`,
    metadata: {
      emsType: "LICENSE_PURCHASE",
      transactionId: transaction.id,
      songId: song.id,
      buyerId: session.user.id,
      artistId: song.artistId,
    },
  });

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: { stripeSessionId: stripeSession.id },
  });

  return NextResponse.json({ url: stripeSession.url });
}
