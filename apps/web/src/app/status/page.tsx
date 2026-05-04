import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "System status | Epic Music Space",
  description: "Live health of every service powering Epic Music Space.",
};

export const revalidate = 30; // re-fetch every 30s

const SEVERITY_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  INVESTIGATING: { dot: "bg-yellow-400", label: "Investigating", text: "text-yellow-300" },
  IDENTIFIED:    { dot: "bg-orange-400", label: "Identified",    text: "text-orange-300" },
  MONITORING:    { dot: "bg-sky-400",    label: "Monitoring",    text: "text-sky-300" },
  RESOLVED:      { dot: "bg-emerald-400",label: "Resolved",      text: "text-emerald-300" },
};

interface ServiceCheck {
  name: string;
  status: "ok" | "degraded" | "down" | "not_configured";
  latencyMs?: number;
  message?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  services: ServiceCheck[];
}

const LABELS: Record<string, string> = {
  database: "Database (Postgres)",
  redis: "Redis (caching + queues)",
  supabase_storage: "Supabase Storage",
  stripe: "Stripe (payments)",
  mux: "Mux (video)",
  livekit: "LiveKit (rooms)",
};

const STATUS_STYLES: Record<ServiceCheck["status"], { dot: string; label: string; text: string }> = {
  ok: { dot: "bg-emerald-400", label: "Operational", text: "text-emerald-300" },
  degraded: { dot: "bg-yellow-400", label: "Degraded", text: "text-yellow-300" },
  down: { dot: "bg-red-500", label: "Down", text: "text-red-300" },
  not_configured: { dot: "bg-white/20", label: "Not configured", text: "text-white/40" },
};

async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${getSiteUrl()}/api/health`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok && res.status !== 503) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

async function getActiveIncidents() {
  try {
    return await prisma.statusIncident.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  } catch {
    return [];
  }
}

export default async function StatusPage() {
  const [data, incidents] = await Promise.all([getHealth(), getActiveIncidents()]);

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Couldn&apos;t reach the health endpoint</h1>
        <p className="mt-2 text-sm text-white/50">
          The status page itself is fine — try again in a few seconds.
        </p>
      </div>
    );
  }

  const overall = STATUS_STYLES[
    data.status === "healthy" ? "ok" : data.status === "down" ? "down" : "degraded"
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-3">
        <span className={`h-3 w-3 animate-pulse rounded-full ${overall.dot}`} />
        <h1 className="text-2xl font-extrabold">
          {data.status === "healthy"
            ? "All systems operational"
            : data.status === "down"
              ? "Major outage"
              : "Degraded performance"}
        </h1>
      </div>

      <p className="mb-6 text-xs text-white/40">
        Last checked: {new Date(data.timestamp).toLocaleString()}
      </p>

      {incidents.length > 0 && (
        <section className="mb-6 space-y-3">
          {incidents.map((inc) => {
            const sev = SEVERITY_STYLE[inc.severity] ?? SEVERITY_STYLE.INVESTIGATING;
            return (
              <div
                key={inc.id}
                className="rounded-2xl border border-yellow-500/35 bg-yellow-500/8 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${sev.dot}`} />
                    <span className={`text-xs font-bold uppercase tracking-widest ${sev.text}`}>
                      {sev.label}
                    </span>
                    <span className="text-xs text-white/35">
                      · {new Date(inc.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <h3 className="mt-2 text-base font-bold">{inc.title}</h3>
                {inc.body && (
                  <p className="mt-1 text-sm text-white/65 whitespace-pre-wrap">{inc.body}</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <ul className="space-y-2">
        {data.services.map((s) => {
          const style = STATUS_STYLES[s.status];
          return (
            <li
              key={s.name}
              className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/3 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                <span className="text-sm font-medium">{LABELS[s.name] ?? s.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {s.latencyMs !== undefined && s.status === "ok" && (
                  <span className="tabular-nums text-white/40">{s.latencyMs}ms</span>
                )}
                <span className={style.text}>{style.label}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-xs text-white/30">
        This page refreshes automatically every 30 seconds.
      </p>
    </div>
  );
}
