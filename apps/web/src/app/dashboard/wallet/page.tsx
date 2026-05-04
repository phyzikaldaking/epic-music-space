import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWalletBalance } from "@/lib/revenueShare";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wallet | Epic Music Space",
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
      include: { event: { select: { type: true, occurredAt: true, songId: true } } },
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
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
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
      </div>

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
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#0d0d14]">
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
