import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRiskEventSummary } from "@/lib/riskEvents";
import { getRedis } from "@/lib/redis";
import RiskActions from "./RiskActions";
import StreamGuardControls from "./StreamGuardControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const severityTone: Record<string, string> = {
  LOW: "text-white/55",
  MEDIUM: "text-yellow-300",
  HIGH: "text-orange-300",
  CRITICAL: "text-red-300",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-t border-white/10 py-4">
      <p className="text-xs font-bold uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function formatMeta(value: unknown) {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export default async function AdminRiskPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/risk");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const summary = await getRiskEventSummary();
  const recentSongs = await prisma.song.findMany({
    where: { isActive: true, isDraft: false },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      artist: true,
    },
  });
  const total24h = summary.byType24h.reduce((sum, row) => sum + row._count._all, 0);
  const high24h =
    summary.bySeverity24h.find((row) => row.severity === "HIGH")?._count._all ?? 0;
  const critical24h =
    summary.bySeverity24h.find((row) => row.severity === "CRITICAL")?._count._all ?? 0;
  const fakePlay24h =
    summary.byType24h.find((row) => row.eventType === "fake_play")?._count._all ?? 0;

  const redis = getRedis();
  let activeStreamBans: Array<{ ip: string; ttl: number; reason: string }> = [];
  let activeSongGuards: Array<{ songId: string; mode: "preview_only" | "blocked"; ttl: number; reason: string | null }> = [];
  if (redis) {
    try {
      const keys = await redis.keys("ems:stream:ban:*");
      const songGuardKeys = await redis.keys("ems:stream:guard:song:*");
      const rows = await Promise.all(
        keys.slice(0, 100).map(async (k) => {
          const [ttl, value] = await Promise.all([redis.ttl(k), redis.get(k)]);
          const ip = k.replace("ems:stream:ban:", "");
          let reason = "abuse";
          if (value) {
            try {
              const parsed = JSON.parse(value) as { reason?: string };
              if (parsed.reason) reason = parsed.reason;
            } catch {
              reason = value;
            }
          }
          return { ip, ttl, reason };
        }),
      );
      activeStreamBans = rows
        .filter((r) => r.ttl > 0)
        .sort((a, b) => b.ttl - a.ttl)
        .slice(0, 30);

      const guardRows = await Promise.all(
        songGuardKeys.slice(0, 100).map(async (k) => {
          const [ttl, value] = await Promise.all([redis.ttl(k), redis.get(k)]);
          const songId = k.replace("ems:stream:guard:song:", "");
          if (!value) return null;
          try {
            const parsed = JSON.parse(value) as { mode?: "preview_only" | "blocked"; reason?: string | null };
            if ((parsed.mode === "preview_only" || parsed.mode === "blocked") && ttl > 0) {
              return {
                songId,
                mode: parsed.mode,
                ttl,
                reason: parsed.reason ?? null,
              };
            }
          } catch {
            return null;
          }
          return null;
        }),
      );
      activeSongGuards = guardRows
        .filter((r): r is { songId: string; mode: "preview_only" | "blocked"; ttl: number; reason: string | null } => Boolean(r))
        .sort((a, b) => b.ttl - a.ttl)
        .slice(0, 30);
    } catch {
      activeStreamBans = [];
      activeSongGuards = [];
    }
  }

  let streamGuardMode: "normal" | "preview_only" | "blocked" = "normal";
  let streamGuardReason: string | null = null;
  let streamGuardTtl: number | null = null;
  if (redis) {
    try {
      const [guardRaw, guardTtl] = await Promise.all([
        redis.get("ems:stream:guard:global"),
        redis.ttl("ems:stream:guard:global"),
      ]);
      if (guardRaw) {
        const parsed = JSON.parse(guardRaw) as {
          mode?: "normal" | "preview_only" | "blocked";
          reason?: string | null;
        };
        if (parsed.mode === "preview_only" || parsed.mode === "blocked") {
          streamGuardMode = parsed.mode;
        }
        streamGuardReason = parsed.reason ?? null;
      }
      if (guardTtl > 0) streamGuardTtl = guardTtl;
    } catch {
      streamGuardMode = "normal";
      streamGuardReason = null;
      streamGuardTtl = null;
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 text-white">
      <header className="mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-300">
            Risk Desk
          </p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Fraud and abuse</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">
            Durable event trail for suspicious signups, fake plays, vote abuse,
            failed payments, and content reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/ops" className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/65 hover:text-white">
            Ops
          </Link>
          <Link href="/admin/reports" className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white/65 hover:text-white">
            Reports
          </Link>
        </div>
      </header>

      <section className="mb-8 grid gap-8 lg:grid-cols-4">
        <dl>
          <Stat label="Risk events 24h" value={total24h} />
        </dl>
        <dl>
          <Stat label="High 24h" value={high24h} />
        </dl>
        <dl>
          <Stat label="Critical 24h" value={critical24h} />
        </dl>
        <dl>
          <Stat label="High risk 7d" value={summary.highRisk7d} />
        </dl>
      </section>

      <section className="mb-8 grid gap-8 lg:grid-cols-3">
        <dl>
          <Stat label="Fake plays 24h" value={fakePlay24h} />
        </dl>
        <dl>
          <Stat label="Active stream bans" value={activeStreamBans.length} />
        </dl>
        <dl>
          <Stat
            label="Top active ban"
            value={
              activeStreamBans[0]
                ? `${Math.floor(activeStreamBans[0].ttl / 60)}m left`
                : "none"
            }
          />
        </dl>
      </section>

      <section className="mb-8 grid gap-8 lg:grid-cols-3">
        <dl>
          <Stat label="Active song guards" value={activeSongGuards.length} />
        </dl>
        <dl>
          <Stat
            label="Top song guard"
            value={activeSongGuards[0] ? activeSongGuards[0].mode.replace("_", " ") : "none"}
          />
        </dl>
        <dl>
          <Stat
            label="Top song guard TTL"
            value={
              activeSongGuards[0]
                ? `${Math.floor(activeSongGuards[0].ttl / 60)}m left`
                : "none"
            }
          />
        </dl>
      </section>

      <section className="mb-8">
        <StreamGuardControls
          initialMode={streamGuardMode}
          initialReason={streamGuardReason}
          initialTtlSeconds={streamGuardTtl}
          songOptions={recentSongs}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
          Active stream abuse bans
        </h2>
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3">IP hint</th>
                <th>Reason</th>
                <th>TTL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {activeStreamBans.map((ban) => (
                <tr key={`${ban.ip}-${ban.reason}`}>
                  <td className="px-4 py-3 font-mono text-xs text-white/60">{ban.ip}</td>
                  <td className="text-white/75">{ban.reason}</td>
                  <td className="font-mono text-xs text-white/55">{Math.floor(ban.ttl / 60)}m {ban.ttl % 60}s</td>
                </tr>
              ))}
              {activeStreamBans.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-white/40">
                    No active stream abuse bans.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
          Active song guards
        </h2>
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3">Song ID</th>
                <th>Mode</th>
                <th>Reason</th>
                <th>TTL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {activeSongGuards.map((guard) => (
                <tr key={`${guard.songId}-${guard.mode}`}>
                  <td className="px-4 py-3 font-mono text-xs text-white/60">{guard.songId}</td>
                  <td className="text-white/75">{guard.mode.replace("_", " ")}</td>
                  <td className="text-white/65">{guard.reason ?? "—"}</td>
                  <td className="font-mono text-xs text-white/55">{Math.floor(guard.ttl / 60)}m {guard.ttl % 60}s</td>
                </tr>
              ))}
              {activeSongGuards.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-white/40">
                    No active song stream guards.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
            Event types, 24h
          </h2>
          <div className="divide-y divide-white/8 border-y border-white/10">
            {summary.byType24h.length === 0 ? (
              <p className="py-4 text-sm text-white/40">No risk events in the last 24 hours.</p>
            ) : (
              summary.byType24h.map((row) => (
                <div key={row.eventType} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-semibold">{row.eventType.replaceAll("_", " ")}</span>
                  <span className="font-mono text-white/55">{row._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
            Severity, 24h
          </h2>
          <div className="divide-y divide-white/8 border-y border-white/10">
            {summary.bySeverity24h.length === 0 ? (
              <p className="py-4 text-sm text-white/40">No severity buckets yet.</p>
            ) : (
              summary.bySeverity24h.map((row) => (
                <div key={row.severity} className="flex items-center justify-between py-3 text-sm">
                  <span className={`font-semibold ${severityTone[row.severity] ?? "text-white/60"}`}>
                    {row.severity}
                  </span>
                  <span className="font-mono text-white/55">{row._count._all}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/50">
          Recent events
        </h2>
        <div className="overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-widest text-white/40">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Reason</th>
                <th>Refs</th>
                <th>Metadata</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {summary.recent.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3 font-mono text-xs text-white/45">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="font-semibold">{event.eventType}</td>
                  <td className={severityTone[event.severity] ?? "text-white/55"}>{event.severity}</td>
                  <td className="max-w-[220px] truncate text-white/65">{event.reason ?? "—"}</td>
                  <td className="max-w-[220px] truncate font-mono text-xs text-white/40">
                    {[event.actorUserId, event.targetUserId, event.songId, event.transactionId, event.reportId]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="max-w-[260px] truncate font-mono text-xs text-white/35">
                    {formatMeta(event.metadata) || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <RiskActions eventId={event.id} hasSubject={Boolean(event.actorUserId ?? event.targetUserId)} />
                  </td>
                </tr>
              ))}
              {summary.recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                    No risk events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
