import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCreatorWalletSummary } from "@/lib/wallet";
import { stripe } from "@/lib/stripe";
import { strictLimiter } from "@/lib/rateLimit";
import { computeRiskScore, riskBlockResponse } from "@/lib/riskScore";
import { withRouteTimeout } from "@/lib/apiHardening";
import { buildIdempotencyKey } from "@/lib/idempotency";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Rate limit by user (and IP) to prevent rapid-fire transfer requests.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`payout:${userId}`);
    await strictLimiter.consume(`payout-ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Too many payout requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const walletLookup = await withRouteTimeout("payout-wallet-summary", 3000, async () =>
    getCreatorWalletSummary(userId),
  );
  if (!walletLookup.ok) return walletLookup.response;
  const wallet = walletLookup.value;

  // Risk scoring — block HIGH-risk / suspended accounts from withdrawing
  const riskLookup = await withRouteTimeout("payout-risk-score", 3000, async () =>
    computeRiskScore(userId),
  );
  if (!riskLookup.ok) return riskLookup.response;
  const risk = riskLookup.value;
  if (risk.blocked || risk.level === "HIGH") {
    return NextResponse.json(riskBlockResponse(risk, "payout-request"), { status: 403 });
  }

  if (!wallet.payoutReady) {
    return NextResponse.json({ error: "Minimum payout not reached" }, { status: 400 });
  }

  const userLookup = await withRouteTimeout("payout-user-lookup", 3000, async () =>
    prisma.user.findUnique({
      where: { id: userId },
      include: { songs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  );
  if (!userLookup.ok) return userLookup.response;
  const user = userLookup.value;
  if (!user?.stripeConnectId) {
    return NextResponse.json({ error: "User not connected to Stripe" }, { status: 400 });
  }
  // After the optional-chain check, TS doesn't always carry the
  // non-null narrowing of `stripeConnectId` through to where the
  // transfer is created. Pin it locally so the call site can rely on
  // a definite string without a non-null assertion.
  const stripeConnectId: string = user.stripeConnectId;

  const primarySong = user.songs[0];
  if (!primarySong) {
    return NextResponse.json({ error: "No songs found for this creator" }, { status: 400 });
  }

  const payoutAmount = Math.floor(wallet.availableBalance * 100);
  const idempotencyKey = buildIdempotencyKey(req, "payout-request", [
    userId,
    payoutAmount,
  ]);

  const transferResult = await withRouteTimeout("payout-stripe-transfer", 6000, async () =>
    stripe.transfers.create({
      amount: payoutAmount,
      currency: "usd",
      destination: stripeConnectId,
      metadata: { userId },
    }, { idempotencyKey }),
  );
  if (!transferResult.ok) return transferResult.response;
  const transfer = transferResult.value;

  const payoutCreate = await withRouteTimeout("payout-record-create", 3000, async () =>
    prisma.payout.create({
      data: {
        amount: wallet.availableBalance,
        status: "PAID",
        userId,
        songId: primarySong.id,
        period: "auto",
        paidAt: new Date(),
      },
    }),
  );
  if (!payoutCreate.ok) return payoutCreate.response;

  return NextResponse.json({
    status: "paid",
    transferId: transfer.id,
    amount: wallet.availableBalance,
  });
}
