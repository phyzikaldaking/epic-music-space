import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWalletBalance } from "@/lib/revenueShare";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wallet",
  description: "Pending royalties, paid balance, and recent payouts.",
};

const FRIENDLY_TYPE: Record<string, string> = {
  LICENSE_SALE: "License sale",
  TIP: "Tip",
  AD_PURCHASE: "Ad purchase",
  STREAM_ROYALTY: "Stream royalty",
  AUCTION_WIN: "Auction win",
  REFUND: "Refund clawback",
};

const FRIENDLY_STATUS: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  CLAWED_BACK: "Reversed",
  EXCLUDED: "Platform fee",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "text-amber-300",
  PAID: "text-emerald-300",
  CLAWED_BACK: "text-red-300",
  EXCLUDED: "text-white/40",
};

function nextMonday1300UTC(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCHours(13, 0, 0, 0);
  const day = next.getUTCDay();
  const daysUntilMonday =
    day === 1 && now.getTime() < next.getTime() ? 0 : (8 - day) % 7 || 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  return next;
}

function payoutEtaForStatus(status: string, paidAt: Date | null): string {
  if (status === "PAID") {
    return paidAt ? `Paid ${paidAt.toLocaleDateString()}` : "Paid";
  }
  if (status === "CLAWED_BACK") return "Reversed";
  if (status !== "PENDING") return status;
  const nextRun = nextMonday1300UTC();
  return `Expected ${nextRun.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/wallet");

  const userId = session.user.id;

  const [balance, splits, payouts, user] = await Promise.all([
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
            song: {
              select: { title: true, artist: true },
            },
          },
        },
      },
    }),
    prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        connectPayoutsEnabled: true,
        stripeConnectId: true,
        taxFormStatus: true,
        suspicionScore: true,
      },
    }),
  ]);

  const pending = balance.pendingCents / 100;
  const paid = balance.paidCents / 100;
  const clawback = balance.clawbackCents / 100;
  const lifetime = paid + pending;

  const payoutBlocked =
    !user?.stripeConnectId ||
    !user.connectPayoutsEnabled ||
    (user.taxFormStatus !== "COLLECTED" && user.taxFormStatus !== "EXEMPT");

  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const recentPositiveCents = splits
    .filter((split) => split.amountCents > 0 && split.event.occurredAt.getTime() >= sevenDaysAgo)
    .reduce((sum, split) => sum + split.amountCents, 0);
  const dailyEstimate = recentPositiveCents / 100 / 7;

  const holderSplits = splits.filter((s) => s.role === "HOLDER");
  const holderPendingCents = holderSplits
    .filter((s) => s.status === "PENDING")
    .reduce((sum, s) => sum + s.amountCents, 0);
  const holderPaidCents = holderSplits
    .filter((s) => s.status === "PAID")
    .reduce((sum, s) => sum + s.amountCents, 0);

  const pendingStreamCents = splits
    .filter((split) => split.status === "PENDING" && split.event.type === "STREAM_ROYALTY")
    .reduce((sum, split) => sum + split.amountCents, 0);
  const pendingCents = Math.max(balance.pendingCents, 1);
  const streamShare = pendingStreamCents / pendingCents;
  const estimatedRiskScore = Math.max(
    0,
    Math.min(100, Math.round((user?.suspicionScore ?? 0) * 1.2 + streamShare * 35)),
  );
  const estimatedHoldbackRate =
    estimatedRiskScore >= 80 ? 0.6 :
    estimatedRiskScore >= 60 ? 0.4 :
    estimatedRiskScore >= 35 ? 0.2 :
    0;
  const estimatedHoldback = (pendingStreamCents / 100) * estimatedHoldbackRate;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
          Wallet
        </p>
        <h1 className="text-3xl font-extrabold">Royalties &amp; Payouts</h1>
        <p className="mt-1 text-sm text-white/55">
          Live balance from license sales, tips, ads, and listening sessions.
          Payouts run weekly via Stripe Connect.
        </p>
      </div>

      {payoutBlocked && (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/8 px-5 py-4 text-sm text-amber-200">
          <p className="font-bold">Payouts are paused.</p>
          <p className="mt-1 text-amber-200/80">
            {!user?.stripeConnectId
              ? "Connect a Stripe payout account to start receiving transfers."
              : !user.connectPayoutsEnabled
                ? "Stripe is still verifying your account — finish onboarding to unblock payouts."
                : "Tax forms are pending — complete your W-9 / W-8 in Stripe to unblock payouts."}
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-block rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/20"
          >
            Go to dashboard →
          </Link>
        </div>
      )}

      {/* Balance cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">Pending</p>
          <p className="mt-2 text-3xl font-black text-amber-300">
            ${pending.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Accrued, not yet paid out
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">Paid out</p>
          <p className="mt-2 text-3xl font-black text-emerald-300">
            ${paid.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Transferred to your Stripe account
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">Lifetime</p>
          <p className="mt-2 text-3xl font-black">
            ${lifetime.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Pending + paid {clawback < 0 ? `(${clawback.toFixed(2)} reversed)` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">Daily estimate</p>
          <p className="mt-2 text-3xl font-black text-cyan-200">
            ${dailyEstimate.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-white/40">
            Last 7 days average
          </p>
        </div>
      </div>

      {pendingStreamCents > 0 && (
        <div className="mb-8 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-4 text-sm text-cyan-100">
          <p className="font-semibold">Fraud-weighted payout preview</p>
          <p className="mt-1 text-cyan-100/80">
            Stream-royalty pending balance: ${(pendingStreamCents / 100).toFixed(2)} · Risk score {estimatedRiskScore}/100.
            {estimatedHoldbackRate > 0
              ? ` Estimated integrity holdback: $${estimatedHoldback.toFixed(2)} until review clears.`
              : " No integrity holdback currently projected."}
          </p>
        </div>
      )}

      {/* Token holder royalties — shown only when the user holds licenses */}
      {holderSplits.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
            Token holder royalties
          </h2>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
            <p className="mb-4 text-xs text-cyan-100/60">
              You hold licenses on tracks that pay royalties to token holders whenever new licenses sell or streams accrue. These earnings settle in the weekly payout cycle.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Pending holder earnings</p>
                <p className="mt-1 text-2xl font-black text-amber-300">${(holderPendingCents / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Paid to you</p>
                <p className="mt-1 text-2xl font-black text-emerald-300">${(holderPaidCents / 100).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/40">Royalty events</p>
                <p className="mt-1 text-2xl font-black">{holderSplits.length}</p>
              </div>
            </div>
            {holderSplits.slice(0, 5).map((s) => (
              <div key={s.id} className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-sm">
                <div>
                  <p className="font-medium text-white/80">{s.event.song?.title ?? "Platform event"}</p>
                  <p className="text-xs text-white/40">{new Date(s.event.occurredAt).toLocaleDateString()} · {s.event.type === "LICENSE_SALE" ? "License sale" : "Stream royalty"}</p>
                </div>
                <p className={`font-bold tabular-nums ${s.status === "PAID" ? "text-emerald-300" : "text-amber-300"}`}>
                  +${(s.amountCents / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent splits */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
          Recent earnings
        </h2>
        {splits.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-8 text-center text-sm text-white/40">
            No earnings yet. Sell a license, host a paid listening session, or
            collect a tip to start earning.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/8 studio-faceplate-dark">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs font-bold uppercase tracking-widest text-white/45">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {splits.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 text-xs text-white/55">
                      {new Date(s.event.occurredAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {FRIENDLY_TYPE[s.event.type] ?? s.event.type}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/55 capitalize">
                      {s.role.toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {s.amountCents < 0 ? "-" : ""}${(Math.abs(s.amountCents) / 100).toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-bold ${STATUS_COLOR[s.status] ?? ""}`}>
                      {FRIENDLY_STATUS[s.status] ?? s.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Transparent payout receipts */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
          Per-track payout receipts
        </h2>
        {splits.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-8 text-center text-sm text-white/40">
            Receipts appear as soon as royalty events post to your ledger.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/8 studio-faceplate-dark">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-white/5 text-left text-xs font-bold uppercase tracking-widest text-white/45">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Track</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">Fees</th>
                  <th className="px-4 py-3 text-right">Net</th>
                  <th className="px-4 py-3 text-right">Payout ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {splits.slice(0, 15).map((split) => (
                  <tr key={`receipt-${split.id}`}>
                    <td className="px-4 py-3 text-xs text-white/55">
                      {new Date(split.event.occurredAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white/90">
                        {split.event.song?.title ?? "Platform event"}
                      </p>
                      <p className="text-xs text-white/45">
                        {split.event.song?.artist ?? "Epic Music Space"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-white/70">
                      {FRIENDLY_TYPE[split.event.type] ?? split.event.type}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ${(split.event.grossCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white/60">
                      ${(split.event.feeCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {split.amountCents < 0 ? "-" : ""}${(Math.abs(split.amountCents) / 100).toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold ${STATUS_COLOR[split.status] ?? "text-white/55"}`}>
                      {payoutEtaForStatus(split.status, split.paidAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent payouts */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
          Recent payouts
        </h2>
        {payouts.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-8 text-center text-sm text-white/40">
            No payouts issued yet. The cycle runs every Monday at 13:00 UTC.
          </div>
        ) : (
          <div className="space-y-2">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold">
                    ${Number(p.amount).toFixed(2)}{" "}
                    <span className="text-xs font-normal uppercase text-white/40">{p.currency}</span>
                  </p>
                  <p className="text-xs text-white/45">
                    {p.period} · {new Date(p.createdAt).toLocaleDateString()}
                    {p.stripeTransferId ? ` · transfer ${p.stripeTransferId.slice(0, 12)}…` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    p.status === "PAID"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : p.status === "FAILED"
                        ? "border-red-400/40 bg-red-400/10 text-red-300"
                        : "border-white/15 text-white/55"
                  }`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
