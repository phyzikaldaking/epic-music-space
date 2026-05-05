"use client";

import { useState } from "react";

/**
 * Resends the verification email to the signed-in user. The route reads
 * the session for the address — we don't accept an email field from the
 * client, so a stale or hijacked tab can't blast verification mail to
 * arbitrary addresses.
 */
export default function ResendVerificationButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not resend.");
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200">
        ✓ Sent — check your inbox
      </span>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-[#0a0a0a] hover:bg-yellow-300 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Resend link"}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
