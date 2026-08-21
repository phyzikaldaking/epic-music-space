/**
 * Payout Transfer Worker
 *
 * Retries failed Stripe Connect transfers (artist payouts) with exponential
 * backoff. Same idempotency key as the original attempt, so Stripe collapses
 * duplicates if a previous attempt actually went through.
 *
 * Run as a standalone Node.js process:
 *   `npx tsx src/workers/payoutTransfers.ts`
 */

import { Worker } from "bullmq";
import { getBullMqRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { stripe } from "../lib/stripe";
import { sendPayPalPayout } from "../lib/paypal";
import { QUEUE_NAMES } from "../lib/queueNames";
import type { PayoutTransferJobData } from "../lib/queues";
import { enqueueNotification, payoutDeadLetterQueue } from "../lib/queues";
import { page } from "../lib/pager";

const connection = getBullMqRedis();

if (!connection) {
  console.error(
    "[payout-transfers-worker] REDIS_URL is not set — worker cannot start",
  );
  process.exit(1);
}

// Structured log helper for JSON-capable log aggregators
function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const payload = {
    t: new Date().toISOString(),
    service: "payout-transfers-worker",
    level,
    msg,
    ...meta,
  };
  console[level](JSON.stringify(payload));
}

// Alert on permanent payout failures for ops intervention
function alertPayoutFailed(payoutId: string, artistId: string, amountCents: number, reason: string) {
  page({
    severity: "error",
    title: "Payout transfer failed after retries",
    context: {
      service: "payout-transfers-worker",
      payoutId,
      artistId,
      amountUsd: (amountCents / 100).toFixed(2),
      reason,
      timestamp: new Date().toISOString(),
    },
    fingerprint: `payout:failed:${payoutId}`,
  });
}

const worker = new Worker<PayoutTransferJobData>(
  QUEUE_NAMES.payoutTransfers,
  async (job) => {
    const { payoutId, artistId, amountCents, transactionId, idempotencyKey } = job.data;

    log("info", "Processing payout transfer", { payoutId, artistId, amountCents, transactionId, jobId: job.id });

    // If the payout was already settled (e.g., a prior retry succeeded but
    // the job fired again), exit cleanly.
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true, stripeTransferId: true },
    });
    if (!payout) {
      log("warn", "Payout not found — dropping job", { payoutId });
      return;
    }
    if (payout.status === "PAID") {
      log("info", "Payout already PAID — nothing to do", { payoutId, transferId: payout.stripeTransferId });
      return;
    }

    const artist = await prisma.user.findUnique({
      where: { id: artistId },
      select: {
        stripeConnectId: true,
        connectPayoutsEnabled: true,
        email: true,
        name: true,
        payoutMethod: true,
        paypalPayoutEmail: true,
      },
    });
    if (!artist) {
      const msg = `Artist ${artistId} not found — cannot transfer`;
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: "FAILED" },
      });
      log("error", msg, { payoutId, artistId });
      throw new Error(msg);
    }

    // Route the payout via the rail the artist picked. The two branches
    // share the same outer "set Payout to PAID" gate — Stripe writes
    // stripeTransferId, PayPal stores the batch id in the same field
    // prefixed with `paypal:` so observability surfaces don't have to
    // care which rail produced it.
    let externalRef: string;

    if (artist.payoutMethod === "PAYPAL") {
      if (!artist.paypalPayoutEmail) {
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "FAILED" },
        });
        const msg = `Artist ${artistId} selected PAYPAL but has no paypalPayoutEmail`;
        log("error", msg, { payoutId, artistId });
        throw new Error(msg);
      }

      const payout$ = await sendPayPalPayout({
        // PayPal idempotency uses sender_batch_id; reuse our worker's
        // idempotencyKey so retries collapse to the same batch.
        senderBatchId: idempotencyKey,
        recipientEmail: artist.paypalPayoutEmail,
        amountUsd: amountCents / 100,
        note: `EMS payout · txn ${transactionId}${job.data.songId ? ` · song ${job.data.songId}` : ""}`,
      });
      externalRef = `paypal:${payout$.payoutBatchId}`;
    } else {
      // STRIPE rail — original behavior.
      if (!artist.stripeConnectId) {
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "FAILED" },
        });
        const msg = `Artist ${artistId} has no stripeConnectId — cannot transfer`;
        log("error", msg, { payoutId, artistId });
        throw new Error(msg);
      }
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: "usd",
          destination: artist.stripeConnectId,
          metadata: {
            songId: job.data.songId ?? "",
            licenseId: job.data.licenseTokenId ?? "",
            transactionId,
            retried: "true",
            payoutId,
          },
        },
        { idempotencyKey },
      );
      externalRef = transfer.id;
    }

    await prisma.$transaction([
      prisma.payout.update({
        where: { id: payout.id },
        data: { status: "PAID", paidAt: new Date(), stripeTransferId: externalRef },
      }),
      prisma.payoutFailure.updateMany({
        where: { payoutId: payout.id, retried: false },
        data: { retried: true },
      }),
    ]);

    // Tell the artist the retry succeeded so a "your payout failed" alert
    // (if they got one) is visibly resolved. The destination text differs
    // by rail since "Stripe Connect balance" is wrong for a PayPal payee.
    const destination =
      artist.payoutMethod === "PAYPAL"
        ? `your PayPal account (${artist.paypalPayoutEmail ?? "on file"})`
        : "your Stripe Connect balance";
    await enqueueNotification({
      userId: artistId,
      type: "PAYOUT_RETRY_SUCCESS",
      title: "Payout retried — funds on the way",
      body: `An earlier transfer of $${(amountCents / 100).toFixed(2)} was retried successfully and is now in ${destination}.`,
      metadata: { payoutId: payout.id, transactionId, transferId: externalRef },
    });

    log(
      "info",
      "Payout settled on retry",
      { payoutId, transferId: externalRef, artistId, amountCents, rail: artist.payoutMethod },
    );
  },
  {
    connection,
    concurrency: 5,
    // BullMQ job attempts/backoff are configured at queue-creation time
    // (see lib/queues.ts → makeQueue defaultJobOptions)
  },
);

worker.on("completed", (job) => {
  log("info", "Job completed", {
    jobId: job.id,
    payoutId: job.data.payoutId,
    artistId: job.data.artistId,
  });
});

worker.on("failed", async (job, err) => {
  const { payoutId, artistId, amountCents, transactionId } = job?.data || {};
  log("error", "Job failed", {
    jobId: job?.id,
    payoutId,
    artistId,
    attemptsMade: job?.attemptsMade,
    error: err?.message,
    errorType: err?.name,
  });

  // Final attempt exhausted: flip Payout to FAILED so the dashboard /
  // process-payouts cron picks it up for human review.
  if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
    try {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "FAILED" },
      });
      log("warn", "Payout marked FAILED — requires manual review", { payoutId, artistId, transactionId });

      // Alert ops
      alertPayoutFailed(
        payoutId!,
        artistId!,
        amountCents!,
        err?.message ?? "unknown_error",
      );

      // Send artist a failure notification so they know to contact support
      await enqueueNotification({
        userId: artistId!,
        type: "PAYOUT_FAILED",
        title: "Payout delivery hit a snag",
        body: `We couldn't complete your $${(amountCents! / 100).toFixed(2)} payout transfer automatically. Our team is reviewing it and you'll get an update shortly.`,
        metadata: { payoutId, transactionId, error: err?.message },
      });

      // Also send to dead-letter queue for audit trail / replay if needed
      if (payoutDeadLetterQueue) {
        try {
          await payoutDeadLetterQueue.add(
            "payout_transfer_failed",
            {
              queue: QUEUE_NAMES.payoutTransfers,
              reason: err instanceof Error ? err.message : "unknown",
              payload: {
                payoutId,
                transactionId,
                artistId,
                amountCents,
                idempotencyKey: job.data.idempotencyKey,
                finalError: err?.message,
                attemptsMade: job.attemptsMade,
              },
              createdAt: new Date().toISOString(),
            },
            { removeOnComplete: true },
          );
        } catch (dlqErr) {
          log("error", "Failed to enqueue dead-letter job", { payoutId, error: dlqErr });
        }
      }
    } catch (markErr) {
      log("error", "Could not mark payout FAILED", { payoutId, error: markErr });
    }
  }
});

worker.on("error", (err) => {
  log("error", "Worker error", { error: err?.message, errorType: err?.name });
});

async function shutdown(signal: string) {
  log("info", `Received ${signal}, draining…`);
  try {
    await worker.close();
    log("info", "Closed cleanly");
    process.exit(0);
  } catch (err) {
    log("error", "Shutdown failed", { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("info", `Started listening for jobs on ${QUEUE_NAMES.payoutTransfers}`, {
  concurrency: 5,
  attempts: 3,
  redisUrl: process.env.REDIS_URL ? "configured" : "missing",
});
