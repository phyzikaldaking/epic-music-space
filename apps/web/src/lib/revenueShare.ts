import { prisma } from "@/lib/prisma";
import type { Prisma } from "@ems/db";
import { enqueueNotification } from "@/lib/queues";

/**
 * Revenue share + ledger.
 *
 * The platform writes a RevenueEvent (gross income, source pointers) and a
 * fan-out of RevenueSplits (per-user share, status, eventual payout link)
 * for every income-generating action.
 *
 * Wired:
 *   - LICENSE_SALE  : 90% artist, 10% platform
 *   - TIP           : 100% artist
 *   - AD_PURCHASE   : 100% platform
 *   - AUCTION_WIN   : 90% seller, 10% platform
 *   - BOOST         : 100% platform (placement spend)
 *   - SUBSCRIPTION  : 100% platform (subscription tier upgrades)
 *   - REFUND        : negative gross with proportional clawback
 */

const PLATFORM_FEE_BPS = 1000; // 10%

type Tx = Prisma.TransactionClient;

export const PLATFORM_FEE_RATIO = PLATFORM_FEE_BPS / 10_000;

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
          {
            userId: opts.artistId,
            role: "ARTIST",
            amountCents: artistCents,
            status: "PAID",
            paidAt: new Date(),
          },
          {
            userId: opts.artistId,
            role: "PLATFORM",
            amountCents: platformCents,
            status: "EXCLUDED",
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
          userId: opts.buyerId,
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

// ── Auction win (seller is paid out of buyer's win price) ───────────────
export async function recordAuctionWin(opts: {
  tx?: Tx;
  songId: string | null;
  sellerId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string; sellerCents: number; platformCents: number }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const platformCents = Math.floor((grossCents * PLATFORM_FEE_BPS) / 10_000);
  const sellerCents = grossCents - platformCents;
  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "AUCTION_WIN",
      songId: opts.songId,
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: [
          {
            userId: opts.sellerId,
            role: "ARTIST",
            amountCents: sellerCents,
            status: "PENDING", // batched into the weekly payout
          },
          {
            userId: opts.sellerId,
            role: "PLATFORM",
            amountCents: platformCents,
            status: "EXCLUDED",
          },
        ],
      },
    },
    select: { id: true },
  });
  return { eventId: event.id, sellerCents, platformCents };
}

// ── Boost / placement bid (platform retains 100%) ──────────────────────
export async function recordBoost(opts: {
  tx?: Tx;
  songId: string;
  buyerId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "BOOST",
      songId: opts.songId,
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: {
          userId: opts.buyerId,
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

// ── Subscription (platform retains 100% in v1) ─────────────────────────
export async function recordSubscription(opts: {
  tx?: Tx;
  userId: string;
  transactionId: string;
  grossDollars: number;
}): Promise<{ eventId: string }> {
  const grossCents = dollarsToCents(opts.grossDollars);
  const db = opts.tx ?? prisma;

  const event = await db.revenueEvent.create({
    data: {
      type: "SUBSCRIPTION",
      transactionId: opts.transactionId,
      grossCents,
      splits: {
        create: {
          userId: opts.userId,
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

// ── Refund / clawback (proportional for partial refunds) ────────────────
//
// If a refund covers the full gross, every prior split is fully clawed back.
// For partial refunds, each split is reversed proportionally:
//   reverse_amount_i = round(split_i * refundedCents / originalGrossCents)
//
// PAID splits become CLAWED_BACK and a debit split is added so the user's
// next payout cycle nets the loss. PENDING splits are zeroed out by both
// flipping them CLAWED_BACK and adding a counter-event.
export async function recordRefund(opts: {
  transactionId: string;
  amountCents?: number; // optional partial; defaults to full gross
}): Promise<{ eventId: string | null; clawbackCents: number }> {
  const original = await prisma.revenueEvent.findUnique({
    where: { transactionId: opts.transactionId },
    include: { splits: true },
  });
  if (!original) return { eventId: null, clawbackCents: 0 };
  if (original.grossCents <= 0) return { eventId: null, clawbackCents: 0 };

  const refundCents = opts.amountCents ?? original.grossCents;
  const ratio = Math.min(1, refundCents / original.grossCents);

  const debitSplits: { userId: string; role: typeof original.splits[number]["role"]; amountCents: number; status: "PENDING" | "EXCLUDED" }[] = [];
  let touchedPaid = false;

  await prisma.$transaction(async (tx) => {
    for (const s of original.splits) {
      if (s.status === "EXCLUDED") {
        // Platform fee — note the reversal as EXCLUDED for accounting.
        debitSplits.push({
          userId: s.userId,
          role: s.role,
          amountCents: -Math.round(s.amountCents * ratio),
          status: "EXCLUDED",
        });
        continue;
      }

      const reverseCents = Math.round(s.amountCents * ratio);
      if (reverseCents <= 0) continue;

      if (s.status === "PAID") {
        // The original was already paid out — we can't recall it. Mark
        // CLAWED_BACK and write a PENDING debit so the next payout nets.
        touchedPaid = true;
        await tx.revenueSplit.update({
          where: { id: s.id },
          data: { status: "CLAWED_BACK" },
        });
        debitSplits.push({
          userId: s.userId,
          role: s.role,
          amountCents: -reverseCents,
          status: "PENDING",
        });
      } else if (s.status === "PENDING") {
        // Not paid yet — flip to CLAWED_BACK and write a symmetric debit
        // marked EXCLUDED so wallet sums don't double-count.
        await tx.revenueSplit.update({
          where: { id: s.id },
          data: { status: "CLAWED_BACK" },
        });
        debitSplits.push({
          userId: s.userId,
          role: s.role,
          amountCents: -reverseCents,
          status: "EXCLUDED",
        });
      }
    }
  });

  const refundEvent = await prisma.revenueEvent.create({
    data: {
      type: "REFUND",
      songId: original.songId,
      adPlacementId: original.adPlacementId,
      grossCents: -refundCents,
      splits: { create: debitSplits },
    },
    select: { id: true },
  });

  // Critical alert path: an already-paid artist now owes us money. The next
  // payout will net it, but if they never earn again, the platform absorbs
  // the loss. Notify the artist + log for ops.
  if (touchedPaid) {
    const affectedUserIds = Array.from(
      new Set(debitSplits.filter((d) => d.status === "PENDING").map((d) => d.userId)),
    );
    for (const userId of affectedUserIds) {
      try {
        await enqueueNotification({
          userId,
          type: "REFUND_CLAWBACK",
          title: "Refund issued — your next payout is reduced",
          body: "A buyer was refunded. The corresponding royalty was already paid to you, so the amount will be deducted from your next payout cycle.",
          metadata: { transactionId: opts.transactionId, refundCents, refundEventId: refundEvent.id },
        });
      } catch (err) {
        console.warn("[recordRefund] notification failed", err);
      }
    }
    console.warn("[recordRefund] CLAWBACK_AFTER_PAID", {
      transactionId: opts.transactionId,
      refundCents,
      affectedUserIds,
    });
  }

  return { eventId: refundEvent.id, clawbackCents: refundCents };
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

export async function recordStreamRoyalty(_opts: {
  songId: string;
  pennies: number;
}): Promise<void> {
  // Unimplemented — needs stream-event ingestion first.
}
