import { NextRequest, NextResponse } from "next/server";
import { runPayoutCycle, isoWeekPeriod, tryAcquirePayoutLock, releasePayoutLock } from "@/lib/payouts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const periodParam = req.nextUrl.searchParams.get("period");
  const period = periodParam ?? isoWeekPeriod();

  // Postgres advisory lock — refuse the request if another invocation
  // (Vercel retry, manual trigger, parallel CI run) already holds it.
  const acquired = await tryAcquirePayoutLock();
  if (!acquired) {
    return NextResponse.json(
      { ok: false, reason: "another payout cycle is in progress" },
      { status: 423 },
    );
  }

  try {
    const result = await runPayoutCycle(period);
    return NextResponse.json({
      ok: true,
      period,
      totalPayouts: result.totalPayouts,
      totalPaidDollars: result.totalPaidCents / 100,
      breakdown: result.results.map((r) => ({
        userId: r.userId,
        attemptedDollars: r.attemptedCents / 100,
        status: r.status,
        payoutId: r.payoutId,
        ...(r.error ? { error: r.error } : {}),
      })),
    });
  } finally {
    await releasePayoutLock();
  }
}
