"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface ReportRow {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  postId: string | null;
  reportedUserId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reporter: { id: string; name: string | null; email: string };
  reportedUser: { id: string; name: string | null; email: string } | null;
}

const STATUSES = ["PENDING", "SOFT_HOLD", "APPEAL_PENDING", "REVIEWED", "DISMISSED", "ACTIONED"] as const;
type Status = (typeof STATUSES)[number];

export default function AdminReportsClient() {
  const [status, setStatus] = useState<Status>("PENDING");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports?status=${status}`);
      if (!res.ok) throw new Error("Could not load reports.");
      const data = (await res.json()) as { reports: ReportRow[] };
      setReports(data.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reports.");
    } finally {
      setLoading(false);
    }
  }, [status]);

    useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function action(
    id: string,
    next: "SOFT_HOLD" | "REVIEWED" | "DISMISSED" | "ACTIONED" | "APPEAL_PENDING",
  ) {
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) throw new Error("Update failed.");
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest transition ${
              status === s
                ? "bg-brand-500 text-white"
                : "border border-white/10 bg-white/4 text-white/55 hover:bg-white/8"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="rounded-2xl border border-white/8 studio-faceplate p-8 text-center text-sm text-white/40">
          Nothing in the {status.toLowerCase()} queue.
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="rounded-2xl border border-white/8 studio-faceplate p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-3 text-xs text-white/55">
                <span className="rounded-full border border-yellow-500/35 bg-yellow-500/10 px-2 py-0.5 font-bold uppercase tracking-widest text-yellow-200">
                  {r.reason}
                </span>
                <span>{new Date(r.createdAt).toLocaleString()}</span>
                <span className="ml-auto">
                  Reporter:{" "}
                  <code className="rounded bg-white/5 px-1.5 py-0.5">
                    {r.reporter.name ?? r.reporter.email}
                  </code>
                </span>
              </div>

              <div className="mb-2 text-sm text-white/85">
                {r.postId && (
                  <Link
                    href={`/post/${r.postId}`}
                    className="text-brand-400 hover:underline"
                  >
                    View post →
                  </Link>
                )}
                {r.reportedUser && (
                  <span className="ml-2 text-white/55">
                    against{" "}
                    <code className="rounded bg-white/5 px-1.5 py-0.5">
                      {r.reportedUser.name ?? r.reportedUser.email}
                    </code>
                  </span>
                )}
              </div>

              {r.details && (
                <p className="mb-3 whitespace-pre-wrap rounded-lg border border-white/8 bg-black/30 p-3 text-xs text-white/65">
                  {r.details}
                </p>
              )}

              {(status === "PENDING" || status === "APPEAL_PENDING") && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => action(r.id, "SOFT_HOLD")}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/25"
                  >
                    Soft hold
                  </button>
                  <button
                    type="button"
                    onClick={() => action(r.id, "DISMISSED")}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white/65 hover:bg-white/5"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => action(r.id, "REVIEWED")}
                    className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20"
                  >
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    onClick={() => action(r.id, "ACTIONED")}
                    className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-200 hover:bg-red-500/25"
                  >
                    Enforce penalty
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
