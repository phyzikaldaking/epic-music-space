import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getTierFromStripePriceId } from "@/lib/subscriptions";

export async function POST(req: Request) {
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");
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
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;

    if (session.mode === "subscription") {
      const userId = session.metadata?.userId;
      const tier = session.metadata?.tier || getTierFromStripePriceId(session.metadata?.priceId);
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: tier },
        });
      }
      return NextResponse.json({ received: true });
    }

    const metadataType = session.metadata?.type || session.metadata?.emsType;

    if (metadataType === "boost") {
      const songId = session.metadata?.songId;
      const userId = session.metadata?.userId;
      const boostPoints = Number(session.metadata?.boostPoints ?? 0);

      if (songId && userId && boostPoints > 0) {
        await prisma.song.update({
          where: { id: songId },
          data: { boostScore: { increment: boostPoints } },
        });

        await prisma.transaction.updateMany({
          where: {
            stripeSessionId: session.id,
            userId,
            songId,
            type: "BOOST",
          },
          data: {
            status: "SUCCEEDED",
            metadata: {
              type: "boost",
              packageId: session.metadata?.packageId,
              boostPoints,
              finalizedAt: new Date().toISOString(),
            },
          },
        });
      }

      return NextResponse.json({ received: true });
    }

    if (metadataType === "PAID_PLACEMENT") {
      const ownerId = session.metadata?.userId;
      const title = session.metadata?.title ?? "Premium Placement";
      const location = session.metadata?.location ?? "MARKETPLACE_BANNER";
      const days = Number(session.metadata?.days ?? 7);
      const amount = Number(session.amount_total ?? 0) / 100;

      if (ownerId && amount > 0) {
        const now = new Date();
        const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        await prisma.adPlacement.create({
          data: {
            ownerId,
            title,
            location,
            mediaUrl: session.metadata?.mediaUrl ?? "",
            linkUrl: session.metadata?.linkUrl ?? null,
            price: amount,
            startDate: now,
            endDate,
            isActive: true,
          },
        });

        await prisma.transaction.updateMany({
          where: {
            stripeSessionId: session.id,
            userId: ownerId,
            type: "BOOST",
          },
          data: {
            status: "SUCCEEDED",
            metadata: {
              type: "paid_placement",
              location,
              days,
              finalizedAt: now.toISOString(),
            },
          },
        });
      }

      return NextResponse.json({ received: true });
    }

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
      data: { soldLicenses: { increment: 1 } },
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
      const artist = await prisma.user.findUnique({ where: { id: song.artistId } });

      if (artist?.stripeConnectId && payoutAmount > 0) {
        await stripe.transfers.create({
          amount: Math.round(payoutAmount * 100),
          currency: "usd",
          destination: artist.stripeConnectId,
          metadata: { songId: song.id, licenseId: license.id },
        });

        await prisma.payout.updateMany({
          where: {
            userId: artist.id,
            songId: song.id,
            licenseTokenId: license.id,
          },
          data: { status: "PAID", paidAt: new Date() },
        });
      }
    } catch {}
  }

  return NextResponse.json({ received: true });
}
