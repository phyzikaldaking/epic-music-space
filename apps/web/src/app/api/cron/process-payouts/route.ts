import { NextRequest, NextResponse } from "next/server";
import { runPayoutCycle, isoWeekPeriod } from "@/lib/payouts";

export const runtime = "nodejs";
// Payout transfers can take a while when many users qualify — give it more headroom.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow override for backfill / manual cycles via ?period=2026-W19
  const periodParam = req.nextUrl.searchParams.get("period");
  const period = periodParam ?? isoWeekPeriod();

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
}
