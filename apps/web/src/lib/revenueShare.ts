import { prisma } from "@/lib/prisma";
import type { Prisma } from "@ems/db";

/**
 * Revenue share + ledger.
 *
 * The platform writes a RevenueEvent (gross income, source pointers) and a
 * fan-out of RevenueSplits (per-user share, status, eventual payout link)
 * for every income-generating action. PENDING splits accrue in the user's
 * wallet; the payout cron later batches them into Stripe transfers.
 *
 * Currently wired:
 *   - License sale (LICENSE_SALE)  : 90% artist, 10% platform
 *   - Tip          (TIP)           : 100% artist (Stripe fees absorbed by buyer)
 *   - Ad purchase  (AD_PURCHASE)   : 100% platform (no host share v1)
 *   - Refund/dispute lost (REFUND) : claws back the most-recent matching event
 *
 * Future hooks (recordStreamRoyalty etc.) are stubbed but unused.
 */

const PLATFORM_FEE_BPS = 1000; // 10% in basis points

type Tx = Prisma.TransactionClient;

function dollarsToCents(d: number | string): number {
  const n = typeof d === "number" ? d : Number(d);
  return Math.round(n * 100);
}

// ── License sale ────────────────────────────────────────────────────────
export async function recordLicenseSale(opts: {
  tx?: Tx;
  songId: string;
  artistId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string; artistCents: number; platformCents: number }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const platformCents = Math.floor((grossCents * PLATFORM_FEE_BPS) / 10_000);
  const artistCents = grossCents - platformCents;

  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "LICENSE_SALE",
      songId: opts.songId,
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: [
          // Artist share is marked PAID immediately because the existing
          // license-sale flow does an instant Stripe transfer to the artist
          // (see webhooks/stripe handleLicenseCheckoutCompleted). Splits are
          // a record-of-truth even when the transfer is synchronous.
          {
            userId: opts.artistId,
            role: "ARTIST",
            amountCents: artistCents,
            status: "PAID",
            paidAt: new Date(),
          },
          {
            userId: opts.artistId,        // platform fees attribute to platform org
            role: "PLATFORM",
            amountCents: platformCents,
            status: "EXCLUDED",          // not paid out — platform retains
          },
        ],
      },
    },
    select: { id: true },
  });

  return { eventId: event.id, artistCents, platformCents };
}

// ── Tip ─────────────────────────────────────────────────────────────────
export async function recordTip(opts: {
  tx?: Tx;
  artistId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string; artistCents: number }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "TIP",
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: {
          userId: opts.artistId,
          role: "ARTIST",
          amountCents: grossCents,
          // Existing tip flow also does an instant transfer — mark PAID.
          status: "PAID",
          paidAt: new Date(),
        },
      },
    },
    select: { id: true },
  });

  return { eventId: event.id, artistCents: grossCents };
}

// ── Ad purchase ─────────────────────────────────────────────────────────
export async function recordAdPurchase(opts: {
  tx?: Tx;
  buyerId: string;
  adPlacementId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "AD_PURCHASE",
      adPlacementId: opts.adPlacementId,
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: {
          // Platform retains 100% of ad spend in v1.
          userId: opts.buyerId, // attributed back to buyer for ledger reads
          role: "PLATFORM",
          amountCents: grossCents,
          status: "EXCLUDED",
        },
      },
    },
    select: { id: true },
  });

  return { eventId: event.id };
}

// ── Refund / clawback ───────────────────────────────────────────────────
// Negates the most-recent revenue event tied to a transaction.
export async function recordRefund(opts: {
  transactionId: string;
  amountCents?: number;  // optional partial; defaults to full original gross
}): Promise<{ eventId: string | null }> {
  const original = await prisma.revenueEvent.findUnique({
    where: { transactionId: opts.transactionId },
    include: { splits: true },
  });
  if (!original) return { eventId: null };

  const refundCents = opts.amountCents ?? original.grossCents;

  // Mark prior splits clawed-back (PENDING ones become CLAWED_BACK; PAID
  // ones become CLAWED_BACK and a debit split is added so the next payout
  // nets it out).
  await prisma.$transaction(async (tx) => {
    for (const s of original.splits) {
      if (s.status === "EXCLUDED") continue;

      await tx.revenueSplit.update({
        where: { id: s.id },
        data: { status: "CLAWED_BACK" },
      });
    }
  });

  const refundEvent = await prisma.revenueEvent.create({
    data: {
      type: "REFUND",
      songId: original.songId,
      adPlacementId: original.adPlacementId,
      grossCents: -refundCents,
      // Add a debit split for any user who had been paid for this event so
      // their wallet shows the negative until the next payout cycle nets it.
      splits: {
        create: original.splits
          .filter((s) => s.status !== "EXCLUDED")
          .map((s) => ({
            userId: s.userId,
            role: s.role,
            amountCents: -s.amountCents,
            // If the original was already paid, the debit needs to net at
            // payout time — leave as PENDING.
            // If the original was PENDING, it's been switched to CLAWED_BACK
            // above, and this debit just records the symmetric event.
            status: s.status === "PAID" ? "PENDING" : "EXCLUDED",
          })),
      },
    },
    select: { id: true },
  });

  return { eventId: refundEvent.id };
}

// ── Wallet read ─────────────────────────────────────────────────────────
export async function getWalletBalance(userId: string): Promise<{
  pendingCents: number;
  paidCents: number;
  clawbackCents: number;
}> {
  const rows = await prisma.revenueSplit.groupBy({
    by: ["status"],
    where: { userId, role: { in: ["ARTIST", "HOLDER", "LABEL", "HOST"] } },
    _sum: { amountCents: true },
  });

  let pendingCents = 0;
  let paidCents = 0;
  let clawbackCents = 0;
  for (const r of rows) {
    const sum = r._sum.amountCents ?? 0;
    if (r.status === "PENDING") pendingCents = sum;
    else if (r.status === "PAID") paidCents = sum;
    else if (r.status === "CLAWED_BACK") clawbackCents = sum;
  }

  return { pendingCents, paidCents, clawbackCents };
}

// ── Stub: stream royalty (future) ───────────────────────────────────────
export async function recordStreamRoyalty(_opts: {
  songId: string;
  pennies: number;
}): Promise<void> {
  // To implement: weekly cron sums streamCount delta * rate, distributes
  // across artist + active license holders proportional to revenueSharePct.
  // Left intentionally unimplemented — needs a stream-events pipeline first.
}
