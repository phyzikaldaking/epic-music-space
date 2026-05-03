import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe, getStripeWebhookSecret } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getTierFromStripePriceId } from "@/lib/subscriptions";
import type Stripe from "stripe";
import type { AdLocation } from "@ems/db";
import { getResaleSplit } from "@/lib/beatMarket";

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
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode === "subscription") {
      const userId = session.metadata?.userId;
      const tier = (session.metadata?.tier || getTierFromStripePriceId(session.metadata?.priceId)) as import("@ems/db").SubscriptionTier;
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
            location: location as AdLocation,
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

    // ─────────────────────────────────────────────────────────
    // Resale purchase fulfilment
    // ─────────────────────────────────────────────────────────

    if (metadataType === "resale_purchase") {
      const resaleListingId = session.metadata?.resaleListingId;
      const buyerId = session.metadata?.userId;

      if (!resaleListingId || !buyerId) {
        return NextResponse.json({ received: true });
      }

      await prisma.$transaction(async (tx) => {
        const listing = await tx.resaleListing.findUnique({
          where: { id: resaleListingId },
          include: {
            song: { select: { id: true, artistId: true } },
            licenseToken: { select: { id: true, holderId: true, songId: true } },
          },
        });

        if (!listing || listing.status !== "ACTIVE") return;
        if (listing.licenseToken.holderId !== listing.sellerId) return;

        // Prevent buying if buyer already holds a license for the song
        const existing = await tx.licenseToken.findFirst({
          where: { songId: listing.songId, holderId: buyerId, status: "ACTIVE" },
          select: { id: true },
        });
        if (existing) return;

        const txRow = await tx.transaction.findFirst({
          where: { stripeSessionId: session.id, userId: buyerId, type: "RESALE_PURCHASE" },
          select: { id: true, status: true },
        });

        if (!txRow) return;
        if (txRow.status === "SUCCEEDED") return;

        await tx.licenseToken.update({
          where: { id: listing.licenseTokenId },
          data: { holderId: buyerId },
        });

        await tx.resaleListing.update({
          where: { id: listing.id },
          data: {
            status: "SOLD",
            soldAt: new Date(),
            buyerId,
            transactionId: txRow.id,
          },
        });

        await tx.transaction.update({
          where: { id: txRow.id },
          data: {
            status: "SUCCEEDED",
            licenseTokenId: listing.licenseTokenId,
            metadata: {
              type: "resale_purchase",
              resaleListingId: listing.id,
              finalizedAt: new Date().toISOString(),
            },
          },
        });

        // Record the artist royalty as a payout row (transfer attempt below)
        const split = getResaleSplit(Number(listing.resalePrice));
        if (split.artistRoyalty > 0) {
          await tx.payout.create({
            data: {
              amount: split.artistRoyalty,
              userId: listing.song.artistId,
              songId: listing.song.id,
              licenseTokenId: listing.licenseTokenId,
              period: "resale",
            },
          });
        }
      });

      // Attempt Stripe Connect transfer to the artist (best-effort)
      try {
        const listing = await prisma.resaleListing.findUnique({
          where: { id: resaleListingId },
          include: { song: { select: { id: true, artistId: true } } },
        });

        if (!listing) return NextResponse.json({ received: true });
        const artist = await prisma.user.findUnique({ where: { id: listing.song.artistId } });

        const split = getResaleSplit(Number(listing.resalePrice));
        if (artist?.stripeConnectId && split.artistRoyalty > 0) {
          await stripe.transfers.create({
            amount: Math.round(split.artistRoyalty * 100),
            currency: "usd",
            destination: artist.stripeConnectId,
            metadata: { songId: listing.song.id, resaleListingId: listing.id },
          });

          await prisma.payout.updateMany({
            where: {
              userId: artist.id,
              songId: listing.song.id,
              period: "resale",
              licenseTokenId: listing.licenseTokenId,
            },
            data: { status: "PAID", paidAt: new Date() },
          });
        }
      } catch (err) {
        console.error("[stripe/webhook] resale artist transfer failed", err);
      }

      return NextResponse.json({ received: true });
    }

    // ─────────────────────────────────────────────────────────
    // Auction win fulfilment (license transfer)
    // ─────────────────────────────────────────────────────────

    if (metadataType === "auction_win") {
      const auctionId = session.metadata?.auctionId;
      const buyerId = session.metadata?.userId;

      if (!auctionId || !buyerId) {
        return NextResponse.json({ received: true });
      }

      await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: { song: { select: { id: true, artistId: true, revenueSharePct: true } } },
        });

        if (!auction) return;
        if (auction.status !== "ENDED") return;
        if (auction.winnerId !== buyerId) return;

        const txRow = await tx.transaction.findFirst({
          where: { stripeSessionId: session.id, userId: buyerId, type: "AUCTION_WIN" },
          select: { id: true, status: true, amount: true },
        });

        if (!txRow) return;
        if (txRow.status === "SUCCEEDED") return;

        // Allocate a new license token for the winner
        const song = await tx.song.findUnique({ where: { id: auction.songId } });
        if (!song || !song.isActive) return;
        if (song.soldLicenses >= song.totalLicenses) return;

        const nextTokenNumber = song.soldLicenses + 1;
        const license = await tx.licenseToken.create({
          data: {
            tokenNumber: nextTokenNumber,
            price: txRow.amount,
            songId: song.id,
            holderId: buyerId,
          },
        });

        await tx.song.update({
          where: { id: song.id },
          data: { soldLicenses: { increment: 1 } },
        });

        await tx.transaction.update({
          where: { id: txRow.id },
          data: { status: "SUCCEEDED", licenseTokenId: license.id },
        });

        await tx.auction.update({
          where: { id: auction.id },
          data: { status: "SETTLED" },
        });

        // Artist payout (same pattern as license purchase)
        const revenueShare = Number(song.revenueSharePct) / 100;
        const amount = Number(txRow.amount);
        const payoutAmount = amount * revenueShare;
        if (payoutAmount > 0) {
          await tx.payout.create({
            data: {
              amount: payoutAmount,
              userId: song.artistId,
              songId: song.id,
              licenseTokenId: license.id,
              period: "auction",
            },
          });
        }
      });

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
    } catch (err) {
      console.error("[stripe/webhook] artist payout transfer failed", err);
    }
  }

  return NextResponse.json({ received: true });
}
