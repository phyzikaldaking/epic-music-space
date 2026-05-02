import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getTierFromStripePriceId } from "@/lib/subscriptions";

export async function POST(req: Request) {
  const sig = headers().get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      getStripeWebhookSecret(),
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;

    // 🔥 SUBSCRIPTION FLOW
    if (session.mode === "subscription") {
      const userId = session.metadata?.userId;
      const priceId = session.display_items?.[0]?.price?.id || session.metadata?.priceId;

      const tier = getTierFromStripePriceId(priceId);

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: tier },
        });
      }

      return NextResponse.json({ received: true });
    }

    // 🔥 LICENSE PURCHASE FLOW (existing)
    const transactionId = session.metadata?.transactionId;
    if (!transactionId) {
      return NextResponse.json({ received: true });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { song: true },
    });

    if (!transaction || transaction.status === "SUCCEEDED") {
      return NextResponse.json({ received: true });
    }

    const song = transaction.song;
    if (!song) {
      return NextResponse.json({ error: "Song missing" }, { status: 500 });
    }

    const nextTokenNumber = song.soldLicenses + 1;

    const license = await prisma.licenseToken.create({
      data: {
        tokenNumber: nextTokenNumber,
        price: transaction.amount,
        songId: song.id,
        holderId: transaction.userId,
      },
    });

    await prisma.song.update({
      where: { id: song.id },
      data: {
        soldLicenses: { increment: 1 },
      },
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "SUCCEEDED",
        licenseTokenId: license.id,
      },
    });

    const revenueShare = Number(song.revenueSharePct) / 100;
    const payoutAmount = Number(transaction.amount) * revenueShare;

    await prisma.payout.create({
      data: {
        amount: payoutAmount,
        userId: song.artistId,
        songId: song.id,
        licenseTokenId: license.id,
        period: "instant",
      },
    });

    try {
      const artist = await prisma.user.findUnique({
        where: { id: song.artistId },
      });

      if (artist?.stripeConnectId && payoutAmount > 0) {
        await stripe.transfers.create({
          amount: Math.round(payoutAmount * 100),
          currency: "usd",
          destination: artist.stripeConnectId,
          metadata: {
            songId: song.id,
            licenseId: license.id,
          },
        });

        await prisma.payout.updateMany({
          where: {
            userId: artist.id,
            songId: song.id,
            licenseTokenId: license.id,
          },
          data: {
            status: "PAID",
            paidAt: new Date(),
          },
        });
      }
    } catch (err) {}
  }

  return NextResponse.json({ received: true });
}
