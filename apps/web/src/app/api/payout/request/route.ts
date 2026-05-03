import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorWalletSummary } from "@/lib/wallet";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const wallet = await getCreatorWalletSummary(userId);

  if (!wallet.payoutReady) {
    return NextResponse.json({ error: "Minimum payout not reached" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { songs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!user?.stripeConnectId) {
    return NextResponse.json({ error: "User not connected to Stripe" }, { status: 400 });
  }

  const primarySong = user.songs[0];
  if (!primarySong) {
    return NextResponse.json({ error: "No songs found for this creator" }, { status: 400 });
  }

  const payoutAmount = Math.floor(wallet.availableBalance * 100);

  const transfer = await stripe.transfers.create({
    amount: payoutAmount,
    currency: "usd",
    destination: user.stripeConnectId,
    metadata: { userId },
  });

  await prisma.payout.create({
    data: {
      amount: wallet.availableBalance,
      status: "PAID",
      userId,
      songId: primarySong.id,
      period: "auto",
      paidAt: new Date(),
    },
  });

  return NextResponse.json({
    status: "paid",
    transferId: transfer.id,
    amount: wallet.availableBalance,
  });
}
