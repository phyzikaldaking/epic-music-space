import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOpsSnapshot } from "@/lib/opsSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Metric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "text-white",
    good: "text-emerald-300",
    warn: "text-yellow-300",
    bad: "text-red-300",
  };
  return (
    <div className="border-t border-white/10 py-4">
      <dt className="text-xs font-bold uppercase tracking-widest text-white/35">{label}</dt>
      <dd className={`mt-1 text-2xl font-black ${tones[tone]}`}>{value}</dd>
    </div>
  );
}

function HealthDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />;
}

export default async function AdminOpsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/ops");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const snapshot = await getOpsSnapshot();
  const readinessTone = snapshot.readiness === "ok" ? "good" : snapshot.readiness === "degraded" ? "warn" : "bad";

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 text-white">
      <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent-300">Command Center</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Live operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">
            Production readiness, traffic, money movement, queue health, and trust signals in one operator view.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/status" className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/65 hover:text-white">
            Status detail
          </Link>
          <Link href="/admin/reports" className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/65 hover:text-white">
            Reports
          </Link>
          <Link href="/status" className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/65 hover:text-white">
            Public status
          </Link>
        </div>
      </header>

      <section className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <HealthDot ok={snapshot.readiness === "ok"} />
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">Readiness</h2>
          </div>
          <dl className="grid gap-x-8 sm:grid-cols-3">
            <Metric label="Overall" value={snapshot.readiness} tone={readinessTone} />
            <Metric label="DB latency" value={`${snapshot.db.latencyMs}ms`} tone={snapshot.db.ok ? "good" : "bad"} />
            <Metric
              label="Redis"
              value={snapshot.redis.configured ? `${snapshot.redis.latencyMs}ms` : "missing"}
              tone={snapshot.redis.configured && snapshot.redis.ok ? "good" : snapshot.redis.required ? "bad" : "warn"}
            />
          </dl>
        </div>
        <div className="border-l border-white/10 pl-6 max-lg:border-l-0 max-lg:pl-0">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">Deploy</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-white/35">Env</dt><dd className="font-mono">{snapshot.deploy.env}</dd></div>
            <div><dt className="text-white/35">Region</dt><dd className="font-mono">{snapshot.deploy.region}</dd></div>
            <div><dt className="text-white/35">Branch</dt><dd className="font-mono">{snapshot.deploy.branch}</dd></div>
            <div><dt className="text-white/35">Commit</dt><dd className="font-mono">{snapshot.deploy.commitShort}</dd></div>
          </dl>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-3">
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">Traffic</h2>
          <dl>
            <Metric label="Plays in 5m" value={snapshot.traffic.plays5m} />
            <Metric label="Live rooms" value={snapshot.traffic.activeRooms} />
            <Metric label="Signups 24h" value={snapshot.traffic.registrations24h} />
            <Metric label="Uploads 24h" value={snapshot.traffic.songs24h} />
          </dl>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">Money</h2>
          <dl>
            <Metric label="Transactions 24h" value={snapshot.money.transactions24h} />
            <Metric label="Failed payments" value={snapshot.money.failedTransactions24h} tone={snapshot.money.failedTransactions24h > 0 ? "warn" : "good"} />
            <Metric label="Failure rate" value={`${snapshot.money.failedPaymentRate}%`} tone={snapshot.money.failedPaymentRate >= 10 ? "bad" : snapshot.money.failedPaymentRate > 3 ? "warn" : "good"} />
          </dl>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">Trust</h2>
          <dl>
            <Metric label="Open reports" value={snapshot.trust.openReports} tone={snapshot.trust.openReports > 25 ? "warn" : "neutral"} />
            <Metric label="Flagged users" value={snapshot.trust.flaggedUsers} tone={snapshot.trust.flaggedUsers > 0 ? "warn" : "good"} />
            <Metric label="Active incidents" value={snapshot.trust.activeIncidents} tone={snapshot.trust.activeIncidents > 0 ? "bad" : "good"} />
          </dl>
        </div>
      </section>

      <section className="mt-8 border-t border-white/10 pt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">Queues</h2>
          <span className="text-xs text-white/35">Backlog {snapshot.queueBacklog} · failed {snapshot.failedJobs}</span>
        </div>
        {!snapshot.queues ? (
          <p className="text-sm text-yellow-200">Redis queues are unavailable. Production readiness will stay down until REDIS_URL is configured.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-white/40">
                <tr><th className="px-4 py-3">Queue</th><th>Waiting</th><th>Active</th><th>Delayed</th><th>Failed</th><th>Status</th></tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {snapshot.queues.map((queue) => (
                  <tr key={queue.name}>
                    <td className="px-4 py-3 font-semibold">{queue.name}</td>
                    <td>{queue.waiting ?? 0}</td>
                    <td>{queue.active ?? 0}</td>
                    <td>{queue.delayed ?? 0}</td>
                    <td className={(queue.failed ?? 0) > 0 ? "text-yellow-300" : "text-white/60"}>{queue.failed ?? 0}</td>
                    <td>{queue.ok ? "ok" : "down"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
