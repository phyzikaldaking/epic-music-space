"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrderActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deliver() {
    if (!url.trim()) {
      setErr("Paste a download / playback URL.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/services/orders/${orderId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliverableUrl: url.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(data.error ?? "Couldn't mark delivered.");
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
      >
        Deliver
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Final mix / master URL"
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none focus:border-brand-500/50"
      />
      {err && <p className="text-[11px] text-red-300">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); }}
          className="flex-1 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={deliver}
          disabled={busy}
          className="flex-1 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy ? "..." : "Mark delivered"}
        </button>
      </div>
    </div>
  );
}
