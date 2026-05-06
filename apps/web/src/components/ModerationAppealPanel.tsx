"use client";

import { useMemo, useState } from "react";

type AppealableReport = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
};

export default function ModerationAppealPanel({
  reports,
}: {
  reports: AppealableReport[];
}) {
  const [reportId, setReportId] = useState(reports[0]?.id ?? "");
  const [requestedOutcome, setRequestedOutcome] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    ticketCode: string;
    appealDueBy: string;
  } | null>(null);

  const disabled = useMemo(
    () => !reportId || evidence.trim().length < 20 || submitting,
    [reportId, evidence, submitting],
  );

  async function submitAppeal() {
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/reports/appeal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportId,
          requestedOutcome: requestedOutcome.trim() || undefined,
          evidence,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        ticketCode?: string;
        timeline?: { appealDueBy?: string };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Appeal request failed.");
      }
      setSuccess({
        ticketCode: data.ticketCode ?? "unknown",
        appealDueBy: data.timeline?.appealDueBy ?? "",
      });
      setEvidence("");
      setRequestedOutcome("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appeal request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-3">
        <p className="text-sm font-semibold text-white">Appeal Review</p>
        <p className="mt-1 text-xs text-white/50">
          Borderline enforcement actions go through a fast human-review lane with a 48h response SLA.
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/50">
          No appeal-eligible reports at the moment.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-xs text-white/60">
            Report
            <select
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-brand-400"
            >
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id.slice(0, 10)}... · {r.reason} · {r.status}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-white/60">
            Requested outcome
            <input
              value={requestedOutcome}
              onChange={(e) => setRequestedOutcome(e.target.value)}
              placeholder="Example: reinstate post after manual review"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand-400"
            />
          </label>

          <label className="block text-xs text-white/60">
            Evidence
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={4}
              placeholder="Share context, ownership proof, links, and anything reviewers should verify."
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand-400"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300">
              Appeal submitted. Ticket: {success.ticketCode}
              {success.appealDueBy ? ` · Due by ${new Date(success.appealDueBy).toLocaleString()}` : ""}
            </p>
          )}

          <button
            type="button"
            onClick={submitAppeal}
            disabled={disabled}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-brand-400/40 bg-brand-500/20 px-4 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Appeal"}
          </button>
        </div>
      )}
    </div>
  );
}
