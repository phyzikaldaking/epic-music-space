import { prisma } from "@/lib/prisma";

export type WalletSummary = {
  userId: string;
  availableBalance: number;
  pendingBalance: number;
  paidOutTotal: number;
  grossEarnings: number;
  payoutReady: boolean;
  minimumPayout: number;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toString" in value) return Number(value.toString());
  return 0;
}

export async function getCreatorWalletSummary(userId: string): Promise<WalletSummary> {
  const payouts = await prisma.payout.findMany({ where: { userId } });
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: "SUCCEEDED",
      type: { in: ["BOOST", "TIP", "REVENUE_PAYOUT", "LICENSE_PURCHASE"] },
    },
  });

  const pendingBalance = payouts
    .filter((payout) => payout.status === "PENDING" || payout.status === "PROCESSING")
    .reduce((sum, payout) => sum + toNumber(payout.amount), 0);

  const paidOutTotal = payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((sum, payout) => sum + toNumber(payout.amount), 0);

  const grossEarnings = transactions.reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const minimumPayout = Number(process.env.MIN_CREATOR_PAYOUT_USD ?? 25);
  const availableBalance = pendingBalance;

  return {
    userId,
    availableBalance,
    pendingBalance,
    paidOutTotal,
    grossEarnings,
    payoutReady: availableBalance >= minimumPayout,
    minimumPayout,
  };
}

export function formatWalletAmount(value: number) {
  return Math.round(value * 100) / 100;
}
