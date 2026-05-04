import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { enqueueNotification } from "@/lib/queues";

const MIN_PAYOUT_USD = Number(process.env.MIN_CREATOR_PAYOUT_USD ?? "20");
const MIN_PAYOUT_CENTS = Math.round(MIN_PAYOUT_USD * 100);
// 1099-NEC threshold: above this in a calendar year and US tax form must be on file.
const TAX_REPORTABLE_THRESHOLD_CENTS = 60_000; // $600 / yr

// Stable advisory-lock keys for the cron. Any 2 ints. Together they form a 64-bit key.
const PAYOUT_LOCK_KEY_A = 0xE3C70D;
const PAYOUT_LOCK_KEY_B = 0x504159; // 'PAY'

export type PayoutResult = {
  userId: string;
  attemptedCents: number;
  payoutId?: string;
  status:
    | "PAID"
    | "SKIPPED_BELOW_MIN"
    | "SKIPPED_NO_CONNECT"
    | "SKIPPED_TAX_PENDING"
    | "SKIPPED_TAX_THRESHOLD"
    | "SKIPPED_NEGATIVE"
    | "SKIPPED_CURRENCY"
    | "FAILED";
  error?: string;
};

/** Acquire a Postgres advisory lock for the payout cron. Returns true if held. */
export async function tryAcquirePayoutLock(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${PAYOUT_LOCK_KEY_A}, ${PAYOUT_LOCK_KEY_B})
  `;
  return rows[0]?.pg_try_advisory_lock === true;
}

export async function releasePayoutLock(): Promise<void> {
  await prisma.$queryRaw`SELECT pg_advisory_unlock(${PAYOUT_LOCK_KEY_A}, ${PAYOUT_LOCK_KEY_B})`;
}

async function getYearToDatePaidCents(userId: string): Promise<number> {
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const agg = await prisma.revenueSplit.aggregate({
    where: {
      userId,
      status: "PAID",
      paidAt: { gte: yearStart },
      role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] },
    },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

/**
 * Process all PENDING revenue splits for a single user. Idempotent per
 * (userId, period) via a unique index on Payout.
 */
export async function processPayoutsForUser(
  userId: string,
  period: string,
): Promise<PayoutResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      connectCountry: true,
      taxFormStatus: true,
    },
  });

  if (!user) return { userId, attemptedCents: 0, status: "FAILED", error: "user not found" };

  // Stripe Connect gate
  if (!user.stripeConnectId || !user.connectPayoutsEnabled) {
    return { userId, attemptedCents: 0, status: "SKIPPED_NO_CONNECT" };
  }

  // Currency gate — Stripe destinations have a settlement currency. Today
  // the platform only books USD. Skip non-USD destinations until we add
  // per-currency ledgering.
  let destinationCurrency = "usd";
  try {
    const account = await stripe.accounts.retrieve(user.stripeConnectId);
    destinationCurrency = (account.default_currency ?? "usd").toLowerCase();
  } catch {
    // If we can't reach Stripe, fall through and let the transfer fail loudly.
  }
  if (destinationCurrency !== "usd") {
    return { userId, attemptedCents: 0, status: "SKIPPED_CURRENCY", error: `destination=${destinationCurrency}` };
  }

  // Sum pending splits
  const agg = await prisma.revenueSplit.aggregate({
    where: {
      userId,
      status: "PENDING",
      role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] },
    },
    _sum: { amountCents: true },
  });
  const cents = agg._sum.amountCents ?? 0;

  if (cents < 0) return { userId, attemptedCents: cents, status: "SKIPPED_NEGATIVE" };
  if (cents < MIN_PAYOUT_CENTS) return { userId, attemptedCents: cents, status: "SKIPPED_BELOW_MIN" };

  // Tax-form gate — ALWAYS gated above the 1099-NEC threshold for US users.
  // For others, COLLECTED or EXEMPT also unlocks payout.
  if (user.taxFormStatus !== "COLLECTED" && user.taxFormStatus !== "EXEMPT") {
    const yearToDate = await getYearToDatePaidCents(userId);
    const projected = yearToDate + cents;
    if (projected >= TAX_REPORTABLE_THRESHOLD_CENTS) {
      return { userId, attemptedCents: cents, status: "SKIPPED_TAX_THRESHOLD" };
    }
    return { userId, attemptedCents: cents, status: "SKIPPED_TAX_PENDING" };
  }

  const idempotencyKey = `payout:${userId}:${period}`;

  let payoutId: string | undefined;
  try {
    // Upsert payout row first (idempotent per userId+period via unique index).
    const payout = await prisma.payout.upsert({
      where: { userId_period: { userId, period } },
      create: {
        amount: cents / 100,
        currency: "usd",
        period,
        status: "PENDING",
        userId,
      },
      update: {
        amount: cents / 100,
        // Keep PENDING if a prior attempt errored; otherwise leave as-is.
        status: "PENDING",
      },
    });
    payoutId = payout.id;

    const transfer = await stripe.transfers.create(
      {
        amount: cents,
        currency: "usd",
        destination: user.stripeConnectId,
        metadata: { userId, period, payoutId: payout.id },
      },
      { idempotencyKey },
    );

    await prisma.$transaction([
      prisma.payout.update({
        where: { id: payout.id },
        data: { status: "PAID", paidAt: new Date(), stripeTransferId: transfer.id },
      }),
      prisma.revenueSplit.updateMany({
        where: {
          userId,
          status: "PENDING",
          role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] },
        },
        data: { status: "PAID", payoutId: payout.id, paidAt: new Date() },
      }),
    ]);

    // Best-effort notification — don't let queue hiccups fail the payout.
    try {
      await enqueueNotification({
        userId,
        type: "PAYOUT",
        title: `$${(cents / 100).toFixed(2)} paid out`,
        body: `Your weekly royalty payout for ${period} just hit your account.`,
        metadata: { payoutId: payout.id, period, amountCents: cents },
      });
    } catch (err) {
      console.warn("[payouts] notification failed", err);
    }

    return { userId, attemptedCents: cents, payoutId: payout.id, status: "PAID" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "transfer failed";
    // Persist the failure for ops visibility + retry tooling.
    try {
      await prisma.payoutFailure.create({
        data: { userId, payoutId, period, amountCents: cents, reason: reason.slice(0, 1000) },
      });
    } catch {
      console.warn("[payouts] could not persist failure record");
    }
    if (payoutId) {
      await prisma.payout.update({
        where: { id: payoutId },
        data: { status: "FAILED" },
      }).catch(() => {});
    }
    return { userId, attemptedCents: cents, status: "FAILED", error: reason };
  }
}

export async function runPayoutCycle(period: string): Promise<{
  results: PayoutResult[];
  totalPaidCents: number;
  totalPayouts: number;
}> {
  const candidates = await prisma.revenueSplit.groupBy({
    by: ["userId"],
    where: {
      status: "PENDING",
      role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] },
    },
    _sum: { amountCents: true },
    having: { amountCents: { _sum: { gte: MIN_PAYOUT_CENTS } } },
  });

  const results: PayoutResult[] = [];
  let totalPaidCents = 0;
  let totalPayouts = 0;

  for (const c of candidates) {
    const result = await processPayoutsForUser(c.userId, period);
    results.push(result);
    if (result.status === "PAID") {
      totalPaidCents += result.attemptedCents;
      totalPayouts += 1;
    }
  }

  return { results, totalPaidCents, totalPayouts };
}

export function isoWeekPeriod(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
