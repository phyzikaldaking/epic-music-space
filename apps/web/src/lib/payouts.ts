import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

const MIN_PAYOUT_USD = Number(process.env.MIN_CREATOR_PAYOUT_USD ?? "20");
const MIN_PAYOUT_CENTS = Math.round(MIN_PAYOUT_USD * 100);

export type PayoutResult = {
  userId: string;
  attemptedCents: number;
  payoutId?: string;
  status: "PAID" | "SKIPPED_BELOW_MIN" | "SKIPPED_NO_CONNECT" | "SKIPPED_TAX_PENDING" | "SKIPPED_NEGATIVE" | "FAILED";
  error?: string;
};

/**
 * Process all PENDING revenue splits for a single user. Sums them into a
 * single Stripe transfer (idempotent per period+user) and a Payout row.
 * On success, the splits are linked to the new Payout and flipped to PAID.
 *
 * Called by the cron handler — never from the user-facing path.
 */
export async function processPayoutsForUser(
  userId: string,
  period: string,                  // e.g. "2026-W19" — also used as idempotency key suffix
): Promise<PayoutResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      taxFormStatus: true,
    },
  });

  if (!user) return { userId, attemptedCents: 0, status: "FAILED", error: "user not found" };

  // Tax-form gate: only COLLECTED or EXEMPT users get paid out.
  if (user.taxFormStatus !== "COLLECTED" && user.taxFormStatus !== "EXEMPT") {
    return { userId, attemptedCents: 0, status: "SKIPPED_TAX_PENDING" };
  }

  // Stripe Connect gate: must be onboarded with payouts enabled.
  if (!user.stripeConnectId || !user.connectPayoutsEnabled) {
    return { userId, attemptedCents: 0, status: "SKIPPED_NO_CONNECT" };
  }

  // Sum pending splits (artist/holder/label/host roles only — not platform).
  const agg = await prisma.revenueSplit.aggregate({
    where: {
      userId,
      status: "PENDING",
      role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] },
    },
    _sum: { amountCents: true },
  });
  const cents = agg._sum.amountCents ?? 0;

  if (cents < 0) {
    // Net negative — wait for more inflow before issuing. Don't issue a
    // negative-amount Stripe transfer.
    return { userId, attemptedCents: cents, status: "SKIPPED_NEGATIVE" };
  }
  if (cents < MIN_PAYOUT_CENTS) {
    return { userId, attemptedCents: cents, status: "SKIPPED_BELOW_MIN" };
  }

  // Idempotency: same userId + period must produce the same Stripe transfer.
  const idempotencyKey = `payout:${userId}:${period}`;

  try {
    // Create the Payout row first so we have a stable id to attach splits to,
    // then create the Stripe transfer with the idempotency key.
    const payout = await prisma.payout.create({
      data: {
        amount: cents / 100,
        currency: "usd",
        period,
        status: "PENDING",
        userId,
        // Pick any songId we paid out for — required by current schema.
        // We grab one from the pending splits.
        songId: await pickAnySongIdForUser(userId),
      },
    });

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

    return { userId, attemptedCents: cents, payoutId: payout.id, status: "PAID" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transfer failed";
    return { userId, attemptedCents: cents, status: "FAILED", error: msg };
  }
}

async function pickAnySongIdForUser(userId: string): Promise<string> {
  // The legacy Payout.songId is required (not-null). Prefer the artist's
  // most recent active song; fall back to any song in their pending splits;
  // finally fall back to a sentinel (we may relax this column to nullable
  // in a future migration).
  const ownSong = await prisma.song.findFirst({
    where: { artistId: userId, isActive: true },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (ownSong) return ownSong.id;

  const split = await prisma.revenueSplit.findFirst({
    where: { userId, status: "PENDING" },
    include: { event: { select: { songId: true } } },
  });
  if (split?.event?.songId) return split.event.songId;

  // Last-resort: any song id at all so the FK is satisfied. The Payout row
  // is for a non-song income path (tip, ad, etc.) — surface this in the
  // metadata via the Payout.period. Better fix is making songId nullable.
  const anySong = await prisma.song.findFirst({ select: { id: true } });
  if (!anySong) throw new Error("Cannot create payout: no songs in system");
  return anySong.id;
}

/**
 * Iterate every user with pending splits >= min payout, run processPayoutsForUser
 * for each. Caller supplies the period string.
 */
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

/**
 * "2026-W19" style ISO-week period string used for idempotent payout cycles.
 */
export function isoWeekPeriod(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
