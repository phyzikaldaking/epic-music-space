"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  action: "onboard" | "payout";
  label: string;
  songId?: string;
}

export default function PayoutActions({ action, label, songId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  async function handleClick() {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (action === "onboard") {
        const res = await fetch("/api/stripe-connect/onboarding");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to start onboarding.");
        window.location.href = data.url;
      } else {
        const res = await fetch("/api/stripe-connect/payout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ songId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Payout failed.");
        setSuccess(`Paid ${data.amountCents ? `$${(data.amountCents / 100).toFixed(2)}` : ""}!`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return <span className="text-sm font-semibold text-green-400">{success}</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${
          action === "onboard"
            ? "bg-brand-500 text-white hover:bg-brand-600"
            : "bg-white/10 text-white hover:bg-white/20 border border-white/20"
        }`}
      >
        {loading ? "…" : label}
      </button>
      {error && <p className="text-xs text-red-400 max-w-[180px] text-right">{error}</p>}
    </div>
  );
}
