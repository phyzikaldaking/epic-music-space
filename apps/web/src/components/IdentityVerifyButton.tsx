"use client";

import { useState } from "react";

/**
 * Kicks off Stripe Identity verification: POSTs to /api/stripe-connect/identity
 * and redirects to the hosted URL Stripe returns. The webhook flips
 * identityVerifiedAt on success.
 */
export default function IdentityVerifyButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe-connect/identity", { method: "POST" });
      const data = (await res.json()) as { url?: string; verified?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not start verification.");
      if (data.verified) {
        setError("Already verified.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start verification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Verify ID with Stripe →"}
      </button>
      {error && (
        <p className="text-[11px] text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
