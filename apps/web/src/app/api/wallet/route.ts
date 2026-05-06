import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWalletBalance } from "@/lib/revenueShare";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [balance, recentSplits, recentPayouts] = await Promise.all([
    getWalletBalance(userId),
    prisma.revenueSplit.findMany({
      where: { userId, role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        event: {
          select: {
            type: true,
            occurredAt: true,
            songId: true,
            grossCents: true,
            feeCents: true,
            currency: true,
            song: { select: { title: true, artist: true } },
          },
        },
      },
    }),
    prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Per-role aggregates so clients can surface holder earnings separately.
  const roleAggregates = recentSplits.reduce(
    (acc, s) => {
      if (!acc[s.role]) acc[s.role] = { pendingCents: 0, paidCents: 0, clawbackCents: 0, count: 0 };
      if (s.status === "PENDING")      acc[s.role].pendingCents   += s.amountCents;
      else if (s.status === "PAID")    acc[s.role].paidCents      += s.amountCents;
      else if (s.status === "CLAWED_BACK") acc[s.role].clawbackCents += s.amountCents;
      acc[s.role].count += 1;
      return acc;
    },
    {} as Record<string, { pendingCents: number; paidCents: number; clawbackCents: number; count: number }>,
  );

  return NextResponse.json({
    balance: {
      pendingDollars: balance.pendingCents / 100,
      paidDollars: balance.paidCents / 100,
      clawbackDollars: balance.clawbackCents / 100,
      pendingCents: balance.pendingCents,
      paidCents: balance.paidCents,
      clawbackCents: balance.clawbackCents,
    },
    roleAggregates,
    recentSplits: recentSplits.map((s) => ({
      id: s.id,
      role: s.role,
      amountDollars: s.amountCents / 100,
      status: s.status,
      eventType: s.event.type,
      occurredAt: s.event.occurredAt,
      songId: s.event.songId,
      grossDollars: s.event.grossCents / 100,
      feeDollars: s.event.feeCents / 100,
      currency: s.event.currency,
      songTitle: s.event.song?.title ?? null,
      songArtist: s.event.song?.artist ?? null,
      paidAt: s.paidAt,
    })),
    recentPayouts: recentPayouts.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      period: p.period,
      status: p.status,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      stripeTransferId: p.stripeTransferId,
    })),
  });
}
