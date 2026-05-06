import { redirect } from "next/navigation";
import type { Queue } from "bullmq";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import {
  aiScoringQueue,
  notificationQueue,
  analyticsQueue,
  deadLetterQueue,
} from "@/lib/queues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueueSnapshot {
  name: string;
  ok: boolean;
  waiting?: number;
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  error?: string;
}

async function snapshotQueue(name: string, q: Queue<unknown>): Promise<QueueSnapshot> {
  try {
    const counts = await q.getJobCounts(
      "wait",
      "active",
      "completed",
      "failed",
      "delayed",
    );
    return { name, ok: true, ...counts };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pingRedis(): Promise<
  { configured: false } | { configured: true; ok: boolean; latencyMs: number; error?: string }
> {
  const redis = getRedis();
  if (!redis) return { configured: false };
  const t0 = Date.now();
  try {
    await redis.ping();
    return { configured: true, ok: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
        ok
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-red-500/15 text-red-300"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
      />
      {label}
    </span>
  );
}

export default async function AdminStatusPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/status");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [db, redis, queues, registrations24h, songs24h, totalUsers] = await Promise.all([
    pingDb(),
    pingRedis(),
    (async (): Promise<QueueSnapshot[] | null> => {
      if (!aiScoringQueue || !notificationQueue || !analyticsQueue) return null;
      const results = await Promise.all([
        snapshotQueue("ai-scoring", aiScoringQueue as unknown as Queue<unknown>),
        snapshotQueue("notifications", notificationQueue as unknown as Queue<unknown>),
        snapshotQueue("analytics", analyticsQueue as unknown as Queue<unknown>),
        deadLetterQueue
          ? snapshotQueue("dead-letter", deadLetterQueue as unknown as Queue<unknown>)
          : null,
      ]);
      return results.filter((r): r is QueueSnapshot => r !== null);
    })(),
    prisma.user.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.song.count({ where: { createdAt: { gte: since24h } } }).catch(() => -1),
    prisma.user.count().catch(() => -1),
  ]);

  const commitShort = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? "—";
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "dev";
  const region = process.env.VERCEL_REGION ?? "—";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-white">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">
            <span className="text-gradient-ems">Platform Status</span>
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Live snapshot. Refresh the page to re-poll.
          </p>
        </div>
        <a
          href="/admin"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/60 transition hover:text-white"
        >
          ← Back to Admin
        </a>
      </header>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
          Deploy
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-white/40">Env</dt>
            <dd className="mt-0.5 font-mono">{env}</dd>
          </div>
          <div>
            <dt className="text-white/40">Commit</dt>
            <dd className="mt-0.5 font-mono">{commitShort}</dd>
          </div>
          <div>
            <dt className="text-white/40">Branch</dt>
            <dd className="mt-0.5 font-mono truncate">{branch}</dd>
          </div>
          <div>
            <dt className="text-white/40">Region</dt>
            <dd className="mt-0.5 font-mono">{region}</dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Database
            </h2>
            <StatusPill ok={db.ok} label={db.ok ? "ok" : "down"} />
          </div>
          <p className="text-2xl font-bold">{db.latencyMs}ms</p>
          {db.error && <p className="mt-1 text-xs text-red-300">{db.error}</p>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/50">
              Redis
            </h2>
            {redis.configured ? (
              <StatusPill ok={redis.ok} label={redis.ok ? "ok" : "down"} />
            ) : (
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/50">
                not configured
              </span>
            )}
          </div>
          {redis.configured ? (
            <>
              <p className="text-2xl font-bold">{redis.latencyMs}ms</p>
              {redis.error && <p className="mt-1 text-xs text-red-300">{redis.error}</p>}
            </>
          ) : (
            <p className="text-xs text-white/40">
              Workers run synchronously via DB fallback.
            </p>
          )}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
          Queues
        </h2>
        {!queues ? (
          <p className="text-sm text-white/40">
            REDIS_URL is unset — every enqueue path falls through to a synchronous DB
            write. Workers are not running.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/8">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-white/50">
                <tr>
                  <th className="px-4 py-2 text-left">Queue</th>
                  <th className="px-3 py-2 text-right">Wait</th>
                  <th className="px-3 py-2 text-right">Active</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">Failed</th>
                  <th className="px-3 py-2 text-right">Delayed</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.name} className="border-t border-white/8">
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <StatusPill ok={q.ok} label={q.name} />
                      </div>
                      {q.error && (
                        <p className="mt-1 text-[10px] text-red-300">{q.error}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{q.waiting ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{q.active ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {q.completed ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        (q.failed ?? 0) > 0 ? "text-red-300" : ""
                      }`}
                    >
                      {q.failed ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{q.delayed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/50">
          Activity (last 24h)
        </h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-white/40">New users</dt>
            <dd className="mt-0.5 text-2xl font-bold">{registrations24h}</dd>
          </div>
          <div>
            <dt className="text-white/40">New songs</dt>
            <dd className="mt-0.5 text-2xl font-bold">{songs24h}</dd>
          </div>
          <div>
            <dt className="text-white/40">Total users</dt>
            <dd className="mt-0.5 text-2xl font-bold">{totalUsers}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
