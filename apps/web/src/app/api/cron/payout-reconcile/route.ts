import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { requireCronRequest } from "@/lib/routeAuth";
import { enqueuePayoutTransfer } from "@/lib/queues";
import { page } from "@/lib/pager";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Payout reconciliation cron — the "trust but verify" backstop for the
 * artist payout pipeline. Run this every hour.
 *
 * What it catches that the webhook handlers can't:
 *   1. Webhook delivery loss. Stripe retries 3 days, but every once in a
 *      while a `transfer.failed` / `transfer.reversed` event never makes
 *      it past our endpoint (cold start, DB hiccup, dedupe race). Our
 *      Payout row says PAID forever, but Stripe knows the truth.
 *   2. Stuck PENDING. A platform-side crash between transfers.create and
 *      the post-success commit can leave a Payout PENDING with no
 *      stripeTransferId. Without sweeping these, the artist never gets
 *      retried.
 *   3. Aged PayoutFailure. Failures older than 7 days that were never
 *      retried (because the queue was down at the time) escalate to ops.
 *   4. Drift. Recently PAID payouts whose Stripe transfer is in a state
 *      we don't recognize (returned, reversed, etc.) get flagged.
 */

const STUCK_PENDING_HOURS = 24;
const SWEEP_LOOKBACK_HOURS = 72;
const FAILURE_ESCALATION_DAYS = 7;

interface ReconcileSummary {
  scanned: number;
  fixed: number;
  retried: number;
  stuck: number;
  drift: number;
  failuresEscalated: number;
}

export async function GET(req: NextRequest) {
  const access = requireCronRequest(req);
  if (!access.ok) return access.response;

  const summary: ReconcileSummary = {
    scanned: 0,
    fixed: 0,
    retried: 0,
    stuck: 0,
    drift: 0,
    failuresEscalated: 0,
  };
  const issues: Array<{ payoutId: string; reason: string }> = [];

  // ── 1. Stuck-PENDING detector ─────────────────────────────────────────
  // PENDING for too long → either we crashed mid-transfer or Stripe never
  // accepted it. Either way it needs a human or a retry job.
  const stuckCutoff = new Date(Date.now() - STUCK_PENDING_HOURS * 60 * 60 * 1000);
  const stuckPayouts = await prisma.payout.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: stuckCutoff },
    },
    select: { id: true, userId: true, amount: true, stripeTransferId: true, createdAt: true },
    take: 100,
  });

  for (const p of stuckPayouts) {
    summary.scanned++;
    summary.stuck++;
    if (p.stripeTransferId) {
      // We have a transfer id but never confirmed it — query Stripe.
      try {
        const transfer = await stripe.transfers.retrieve(p.stripeTransferId);
        if (transfer.reversed) {
          await prisma.payout.update({ where: { id: p.id }, data: { status: "FAILED" } });
          summary.fixed++;
          issues.push({ payoutId: p.id, reason: "transfer_reversed_not_synced" });
        } else if (transfer.amount > 0) {
          // Transfer exists and isn't reversed — it succeeded. Sync our row.
          await prisma.payout.update({
            where: { id: p.id },
            data: { status: "PAID", paidAt: new Date(transfer.created * 1000) },
          });
          summary.fixed++;
          issues.push({ payoutId: p.id, reason: "marked_paid_from_stripe_truth" });
        }
      } catch (err) {
        issues.push({
          payoutId: p.id,
          reason: `stripe_retrieve_failed: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    } else {
      // No transfer id at all — retry via queue (worker uses the same
      // idempotency key, so a successful prior attempt won't double-pay).
      await enqueuePayoutTransfer(
        {
          payoutId: p.id,
          transactionId: p.id,
          artistId: p.userId,
          amountCents: Math.round(Number(p.amount) * 100),
          idempotencyKey: `payout-reconcile:${p.id}`,
        },
        "stuck_pending_no_transfer_id",
      );
      summary.retried++;
    }
  }

  if (stuckPayouts.length > 0) {
    page({
      severity: "warn",
      title: "[payouts] stuck PENDING payouts swept by reconcile cron",
      body: `${stuckPayouts.length} payout(s) in PENDING > ${STUCK_PENDING_HOURS}h. ${summary.fixed} fixed from Stripe, ${summary.retried} re-queued.`,
      context: { count: stuckPayouts.length, ...summary },
      fingerprint: "payouts:reconcile:stuck",
    });
  }

  // ── 2. Drift check on recent PAID payouts ────────────────────────────
  // If Stripe says reversed/failed but our row is still PAID, we're lying
  // to the artist. Query a rolling window — bigger windows mean more API
  // calls, but Stripe's transfer.retrieve is cheap (one call per row).
  const driftCutoff = new Date(Date.now() - SWEEP_LOOKBACK_HOURS * 60 * 60 * 1000);
  const recentPaid = await prisma.payout.findMany({
    where: {
      status: "PAID",
      paidAt: { gte: driftCutoff },
      stripeTransferId: { not: null },
    },
    select: { id: true, userId: true, amount: true, stripeTransferId: true },
    take: 200,
  });

  for (const p of recentPaid) {
    summary.scanned++;
    if (!p.stripeTransferId) continue;
    try {
      const transfer = await stripe.transfers.retrieve(p.stripeTransferId);
      const stripeReversed =
        transfer.reversed === true || transfer.amount_reversed >= transfer.amount;
      if (stripeReversed) {
        await prisma.payout.update({ where: { id: p.id }, data: { status: "FAILED" } });
        summary.drift++;
        summary.fixed++;
        issues.push({ payoutId: p.id, reason: "drift_reversed_now_synced" });
        page({
          severity: "warn",
          title: `[payouts] drift detected — Stripe reversed ${p.id}`,
          body: `Payout said PAID; Stripe transfer ${p.stripeTransferId} is reversed. Synced to FAILED.`,
          context: { payoutId: p.id, transferId: p.stripeTransferId, userId: p.userId },
          fingerprint: `payouts:drift:${p.id}`,
        });
      }
    } catch (err) {
      issues.push({
        payoutId: p.id,
        reason: `drift_check_failed: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  // ── 3. Aged unretried PayoutFailure rows ──────────────────────────────
  const escalationCutoff = new Date(
    Date.now() - FAILURE_ESCALATION_DAYS * 86_400_000,
  );
  const agedFailures = await prisma.payoutFailure.findMany({
    where: {
      retried: false,
      createdAt: { lt: escalationCutoff },
    },
    select: { id: true, userId: true, payoutId: true, amountCents: true, reason: true },
    take: 50,
  });
  if (agedFailures.length > 0) {
    summary.failuresEscalated = agedFailures.length;
    page({
      severity: "critical",
      title: `[payouts] ${agedFailures.length} unretried payout failure(s) > ${FAILURE_ESCALATION_DAYS}d`,
      body: `These artists have been waiting on payouts that haven't been retried successfully. Open the ops dashboard.`,
      context: {
        sample: agedFailures.slice(0, 5).map((f) => ({
          failureId: f.id,
          userId: f.userId,
          payoutId: f.payoutId,
          amountDollars: f.amountCents / 100,
          reason: f.reason,
        })),
      },
      fingerprint: "payouts:reconcile:aged-failures",
    });
  }

  return NextResponse.json({
    ok: true,
    summary,
    issues: issues.slice(0, 50), // cap response size
    runAt: new Date().toISOString(),
  });
}
