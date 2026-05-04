"use client";

import { useState } from "react";

export default function BuyServiceButton({
  listingId,
  isInstant,
}: {
  listingId: string;
  isInstant: boolean;
}) {
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleBuy() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/services/${listingId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief.trim() || undefined }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setBusy(false);
      setErr(data.error ?? "Couldn't start checkout.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-3">
      {!isInstant && (
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Brief (BPM, key, references, what you want done)"
          rows={4}
          maxLength={2000}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50"
        />
      )}
      <button
        type="button"
        onClick={handleBuy}
        disabled={busy}
        className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "Loading…" : isInstant ? "Buy & download" : "Book service"}
      </button>
      {err && <p className="text-xs text-red-300">{err}</p>}
      <p className="text-center text-[10px] text-white/35">
        Secure checkout via Stripe. {isInstant ? "Download link delivered after payment." : "You'll get a confirmation email and the engineer will reach out."}
      </p>
    </div>
  );
}
