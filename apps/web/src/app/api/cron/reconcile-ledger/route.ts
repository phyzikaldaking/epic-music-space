import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily reconciliation: sum the local Payout table for the last 7 days and
 * compare against the live total of Stripe transfers in the same window.
 * Logs a warning if they diverge by >$1 or >1%.
 *
 * In production wire this to PagerDuty / Slack via AUTH_ALERT_WEBHOOK_URL.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const isAuthorized = secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Local ledger total
  const localAgg = await prisma.payout.aggregate({
    where: { status: "PAID", paidAt: { gte: since } },
    _sum: { amount: true },
  });
  const localCents = Math.round(Number(localAgg._sum.amount ?? 0) * 100);

  // Stripe transfers (paginated)
  let stripeCents = 0;
  let stripeCount = 0;
  try {
    let starting_after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await stripe.transfers.list({
        limit: 100,
        created: { gte: Math.floor(since.getTime() / 1000) },
        ...(starting_after ? { starting_after } : {}),
      });
      for (const t of page.data) {
        stripeCents += t.amount;
        stripeCount += 1;
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[reconcile-ledger] stripe list failed", err);
    return NextResponse.json({ ok: false, error: "stripe list failed" }, { status: 502 });
  }

  const driftCents = stripeCents - localCents;
  const driftPct = localCents === 0 ? 0 : (driftCents / localCents) * 100;
  const overThreshold = Math.abs(driftCents) > 100 || Math.abs(driftPct) > 1;

  if (overThreshold) {
    console.warn("[reconcile-ledger] DRIFT", {
      since: since.toISOString(),
      localCents,
      stripeCents,
      driftCents,
      driftPct: driftPct.toFixed(3),
      stripeCount,
    });

    const webhookUrl = process.env.AUTH_ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[reconcile-ledger] DRIFT detected: local=$${(localCents / 100).toFixed(2)} stripe=$${(stripeCents / 100).toFixed(2)} drift=$${(driftCents / 100).toFixed(2)} (${driftPct.toFixed(2)}%)`,
          }),
        });
      } catch {
        // alert webhook failures are noisy but not fatal
      }
    }
  }

  // Second check: gross revenue (charges) vs. local Transaction.SUCCEEDED rows.
  // Catches license-buy flows that paid in Stripe but never finalized in DB.
  let chargesCents = 0;
  let chargesCount = 0;
  try {
    let starting_after: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await stripe.charges.list({
        limit: 100,
        created: { gte: Math.floor(since.getTime() / 1000) },
        ...(starting_after ? { starting_after } : {}),
      });
      for (const c of page.data) {
        if (c.paid && !c.refunded) {
          chargesCents += c.amount;
          chargesCount += 1;
        }
      }
      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[reconcile-ledger] stripe charges list failed", err);
  }

  const localRevenueAgg = await prisma.transaction.aggregate({
    where: { status: "SUCCEEDED", createdAt: { gte: since } },
    _sum: { amount: true },
  });
  const localRevenueCents = Math.round(Number(localRevenueAgg._sum.amount ?? 0) * 100);
  const revenueDriftCents = chargesCents - localRevenueCents;
  const revenueDriftPct = localRevenueCents === 0 ? 0 : (revenueDriftCents / localRevenueCents) * 100;
  const revenueOverThreshold =
    Math.abs(revenueDriftCents) > 100 || Math.abs(revenueDriftPct) > 1;

  if (revenueOverThreshold) {
    console.warn("[reconcile-ledger] REVENUE DRIFT", {
      localRevenueCents,
      chargesCents,
      revenueDriftCents,
      revenueDriftPct: revenueDriftPct.toFixed(3),
      chargesCount,
    });
    const webhookUrl = process.env.AUTH_ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[reconcile-ledger] REVENUE DRIFT: local=$${(localRevenueCents / 100).toFixed(2)} stripe=$${(chargesCents / 100).toFixed(2)} drift=$${(revenueDriftCents / 100).toFixed(2)} (${revenueDriftPct.toFixed(2)}%)`,
          }),
        });
      } catch {
        /* alert webhook failures non-fatal */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    since,
    payouts: {
      localDollars: localCents / 100,
      stripeDollars: stripeCents / 100,
      driftDollars: driftCents / 100,
      driftPct: Number(driftPct.toFixed(3)),
      overThreshold,
      stripeCount,
    },
    revenue: {
      localDollars: localRevenueCents / 100,
      stripeDollars: chargesCents / 100,
      driftDollars: revenueDriftCents / 100,
      driftPct: Number(revenueDriftPct.toFixed(3)),
      overThreshold: revenueOverThreshold,
      chargesCount,
    },
  });
}
