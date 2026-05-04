import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin · Finance",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface DayBucket {
  date: string;
  gross: number;
  payouts: number;
  refunds: number;
  net: number;
}

const DAYS = 30;

export default async function AdminFinancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/finance");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Forbidden</h1>
        <p className="mt-2 text-sm text-white/55">Admin access required.</p>
      </div>
    );
  }

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  const [grossAgg, payoutsAgg, refundsAgg, recentPayouts, recentTransactions] = await Promise.all([
    prisma.transaction.aggregate({
      where: { status: "SUCCEEDED", createdAt: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payout.aggregate({
      where: { status: "PAID", paidAt: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: { status: "REFUNDED", updatedAt: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payout.findMany({
      where: { paidAt: { gte: since } },
      orderBy: { paidAt: "desc" },
      take: 20,
      include: { user: { select: { email: true, name: true } } },
    }),
    prisma.transaction.groupBy({
      by: ["type", "status"],
      where: { createdAt: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const gross = Number(grossAgg._sum.amount ?? 0);
  const paid = Number(payoutsAgg._sum.amount ?? 0);
  const refunded = Number(refundsAgg._sum.amount ?? 0);
  const platformGross = gross - paid - refunded;

  // Build a per-day series (basic — just transaction counts day-bucketed).
  const buckets = new Map<string, DayBucket>();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, gross: 0, payouts: 0, refunds: 0, net: 0 });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-extrabold">Finance — last {DAYS} days</h1>
      <p className="mb-6 text-sm text-white/50">
        Live numbers from the local ledger. Compare against Stripe Dashboard
        directly. The reconcile-ledger cron alerts on any drift {">"} $1 or {">"} 1%.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gross" value={`$${gross.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} sub={`${grossAgg._count._all} txns`} />
        <Stat label="Paid to creators" value={`$${paid.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} sub={`${payoutsAgg._count._all} payouts`} highlight />
        <Stat label="Refunds" value={`$${refunded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} sub={`${refundsAgg._count._all} refunds`} />
        <Stat label="Platform net" value={`$${platformGross.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} sub="gross − payouts − refunds" />
      </div>

      <section className="mb-8 rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/55">
          Transaction breakdown by type
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">Sum</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((row, i) => (
                <tr key={`${row.type}-${row.status}-${i}`} className="border-t border-white/5">
                  <td className="px-3 py-2 font-mono text-xs">{row.type}</td>
                  <td className="px-3 py-2 text-white/55">{row.status}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row._count._all}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${Number(row._sum.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {recentTransactions.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-white/40">No transactions in window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-white/3 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/55">
          Recent payouts
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-3 py-2 text-left">Paid at</th>
                <th className="px-3 py-2 text-left">Creator</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Period</th>
              </tr>
            </thead>
            <tbody>
              {recentPayouts.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-3 py-2 text-white/55 whitespace-nowrap">
                    {p.paidAt ? p.paidAt.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 truncate max-w-[200px]">
                    {p.user.name ?? p.user.email ?? p.userId.slice(-8)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-300 tabular-nums">
                    ${Number(p.amount).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs text-white/40">{p.period}</td>
                </tr>
              ))}
              {recentPayouts.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-white/40">No payouts in window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-white/40">
        For real-time reconcile drift, hit{" "}
        <code className="rounded bg-white/8 px-1 py-0.5 font-mono text-[10px]">/api/cron/reconcile-ledger</code>{" "}
        with the cron secret.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-emerald-500/35 bg-emerald-500/8" : "border-white/8 bg-white/3"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-white/40">{label}</p>
      <p className="mt-2 text-xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-white/45">{sub}</p>}
    </div>
  );
}
