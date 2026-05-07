"use client";

import { useEffect, useMemo, useState } from "react";

type ExperimentsResponse = {
  ok: boolean;
  windowDays: number;
  experiments: {
    heroHeadline: { event: string; variants: Record<string, number> };
    splitCtaCopy: { event: string; variants: Record<string, number> };
  };
  funnel: {
    splitCtaClicks: { event: string; byRolePlacement: Record<string, number> };
    signupCompleted: { event: string; byRole: Record<string, number> };
  };
  error?: string;
};

function VariantRows({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((acc, n) => acc + n, 0);
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) {
    return <p className="text-xs text-white/45">No events yet.</p>;
  }

  return (
    <ul className="space-y-1.5">
      {rows.map(([name, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <li key={name} className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-mono text-white/75">{name}</span>
              <span className="text-white/70">
                {count} <span className="text-white/40">({pct}%)</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminExperimentsCard() {
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExperimentsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/analytics/experiments?days=${days}`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as Partial<ExperimentsResponse>;
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        if (!cancelled) setData(json as ExperimentsResponse);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Could not load experiments.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const clickRows = useMemo(() => {
    const entries = Object.entries(data?.funnel.splitCtaClicks.byRolePlacement ?? {});
    return entries.sort((a, b) => b[1] - a[1]);
  }, [data]);

  const signupRows = useMemo(() => {
    const entries = Object.entries(data?.funnel.signupCompleted.byRole ?? {});
    return entries.sort((a, b) => b[1] - a[1]);
  }, [data]);

  const overallConversion = useMemo(() => {
    const totalClicks = Object.values(data?.funnel.splitCtaClicks.byRolePlacement ?? {}).reduce(
      (acc, n) => acc + n,
      0,
    );
    const totalSignups = Object.values(data?.funnel.signupCompleted.byRole ?? {}).reduce(
      (acc, n) => acc + n,
      0,
    );
    const ratePct = totalClicks > 0 ? (totalSignups / totalClicks) * 100 : 0;
    return {
      totalClicks,
      totalSignups,
      ratePct,
    };
  }, [data]);

  const conversionRows = useMemo(() => {
    const clicksByRole: Record<string, number> = {};
    for (const [rolePlacement, count] of Object.entries(
      data?.funnel.splitCtaClicks.byRolePlacement ?? {},
    )) {
      const [role] = rolePlacement.split(":");
      const safeRole = role && role.length > 0 ? role : "(none)";
      clicksByRole[safeRole] = (clicksByRole[safeRole] ?? 0) + count;
    }

    const signupsByRole = data?.funnel.signupCompleted.byRole ?? {};
    const roles = new Set([...Object.keys(clicksByRole), ...Object.keys(signupsByRole)]);

    return Array.from(roles)
      .map((role) => {
        const clicks = clicksByRole[role] ?? 0;
        const signups = signupsByRole[role] ?? 0;
        const ratePct = clicks > 0 ? (signups / clicks) * 100 : 0;
        return {
          role,
          clicks,
          signups,
          ratePct,
        };
      })
      .sort((a, b) => b.ratePct - a.ratePct);
  }, [data]);

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50">
            Homepage experiments
          </h2>
          <p className="mt-1 text-xs text-white/40">
            Assignment and funnel outcomes from PostHog.
          </p>
          {!loading && !error && data && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
              Overall conversion
              <span className="font-mono text-emerald-200">
                {overallConversion.totalClicks > 0 ? `${overallConversion.ratePct.toFixed(1)}%` : "-"}
              </span>
              <span className="text-emerald-200/80">
                ({overallConversion.totalSignups}/{overallConversion.totalClicks})
              </span>
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-white/55">
          Window
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-white/15 bg-[#0f0f15] px-2 py-1 text-xs text-white"
          >
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
            <option value={60}>60d</option>
            <option value={90}>90d</option>
          </select>
        </label>
      </div>

      {loading && <p className="text-sm text-white/45">Loading experiment metrics...</p>}

      {error && (
        <p className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Hero headline variants</p>
            <VariantRows data={data.experiments.heroHeadline.variants} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Split CTA copy variants</p>
            <VariantRows data={data.experiments.splitCtaCopy.variants} />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Split CTA clicks by role/placement</p>
            {clickRows.length === 0 ? (
              <p className="text-xs text-white/45">No clicks yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {clickRows.map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs">
                    <span className="font-mono text-white/75">{key}</span>
                    <span className="text-white/70">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">Signup completed by role</p>
            {signupRows.length === 0 ? (
              <p className="text-xs text-white/45">No completed signups yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {signupRows.map(([key, count]) => (
                  <li key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs">
                    <span className="font-mono text-white/75">{key}</span>
                    <span className="text-white/70">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 lg:col-span-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/45">
              Conversion by role (split CTA click → signup completed)
            </p>
            {conversionRows.length === 0 ? (
              <p className="text-xs text-white/45">No conversion data yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/[0.04] uppercase tracking-wider text-white/40">
                    <tr>
                      <th className="px-3 py-2 text-left">Role</th>
                      <th className="px-3 py-2 text-right">Split clicks</th>
                      <th className="px-3 py-2 text-right">Signups</th>
                      <th className="px-3 py-2 text-right">Conversion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversionRows.map((row) => (
                      <tr key={row.role} className="border-t border-white/8">
                        <td className="px-3 py-2 font-mono text-white/75">{row.role}</td>
                        <td className="px-3 py-2 text-right text-white/70">{row.clicks}</td>
                        <td className="px-3 py-2 text-right text-white/70">{row.signups}</td>
                        <td className="px-3 py-2 text-right text-white/85">
                          {row.clicks > 0 ? `${row.ratePct.toFixed(1)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
