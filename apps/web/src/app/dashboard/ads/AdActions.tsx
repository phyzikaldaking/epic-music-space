"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  placementId: string;
  isActive: boolean;
  ended: boolean;
}

export default function AdActions({ placementId, isActive, ended }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "pause" | "cancel">("");
  const [err, setErr] = useState<string | null>(null);

  async function togglePause() {
    setBusy("pause");
    setErr(null);
    const res = await fetch(`/api/ads/${placementId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: isActive }),
    });
    setBusy("");
    if (!res.ok) {
      setErr("Couldn't update");
      return;
    }
    router.refresh();
  }

  async function cancelCampaign() {
    if (!confirm("Cancel this campaign? It will stop serving immediately. Refunds are reviewed by ops.")) return;
    setBusy("cancel");
    setErr(null);
    const res = await fetch(`/api/ads/${placementId}/cancel`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { refundEligibleDollars?: number; note?: string };
    setBusy("");
    if (!res.ok) {
      setErr("Couldn't cancel");
      return;
    }
    if (typeof data.refundEligibleDollars === "number" && data.refundEligibleDollars > 0) {
      alert(
        `Campaign cancelled.\n\nRefund-eligible: $${data.refundEligibleDollars.toFixed(2)} (proportional to remaining flight time).\n\n${data.note ?? ""}`,
      );
    }
    router.refresh();
  }

  if (ended) {
    return (
      <div className="flex flex-shrink-0 items-center text-xs text-white/30">
        Campaign ended
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={togglePause}
        disabled={!!busy}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10 disabled:opacity-50"
      >
        {busy === "pause" ? "..." : isActive ? "⏸ Pause" : "▶ Resume"}
      </button>
      <button
        type="button"
        onClick={cancelCampaign}
        disabled={!!busy}
        className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:opacity-50"
      >
        {busy === "cancel" ? "..." : "Cancel"}
      </button>
      {err && <p className="text-[10px] text-red-300">{err}</p>}
    </div>
  );
}
