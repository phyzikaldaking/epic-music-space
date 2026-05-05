"use client";

import { useState } from "react";

interface Props {
  reportedUserId: string;
  /**
   * Optional context — when reporting a buyer from a transaction or DM
   * thread we surface that as a hint in the report metadata so the admin
   * sees it at a glance. Not validated server-side.
   */
  context?: { kind: "transaction" | "message" | "profile"; id?: string };
  className?: string;
  label?: string;
}

const REASONS = ["SPAM", "ABUSE", "IMPERSONATION", "NSFW", "OTHER"] as const;
type Reason = (typeof REASONS)[number];

/**
 * Compact "Report" dropdown usable on profiles, transaction rows, and
 * conversation headers. Files a UserReport with the chosen reason and
 * (optionally) a context hint in details.
 */
export default function ReportUserButton({ reportedUserId, context, className, label = "Report" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(reason: Reason) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId,
          reason,
          details: context
            ? `[${context.kind}${context.id ? `:${context.id}` : ""}] reported by user via ReportUserButton`
            : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Report failed.");
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setOpen(false);
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-semibold text-white/55 hover:bg-white/8 hover:text-white"
        }
      >
        🚩 {label}
      </button>
    );
  }

  if (done) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-1.5 text-xs text-emerald-200">
        Reported — thanks. Moderators will review it.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-[#15151c] px-3 py-2">
      <span className="text-[11px] font-semibold text-white/65">Reason:</span>
      {REASONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => void submit(r)}
          disabled={busy}
          className="rounded-full border border-white/15 bg-white/4 px-2.5 py-1 text-[10px] font-bold text-white/80 hover:bg-white/8 disabled:opacity-50"
        >
          {r}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ml-auto rounded-full px-2.5 py-1 text-[10px] text-white/45 hover:text-white/80"
      >
        Cancel
      </button>
      {error && (
        <p className="basis-full rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
