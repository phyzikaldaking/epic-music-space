"use client";

import { useState } from "react";

type Placement = "premium_screen" | "billboard" | "prime_takeover";

const PLACEMENTS: Array<{ id: Placement; label: string; multiplier: string; min: number; description: string }> = [
  { id: "premium_screen", label: "Premium Screen", multiplier: "1x", min: 25, description: "Compete for brighter wall placement." },
  { id: "billboard", label: "Billboard", multiplier: "2x", min: 75, description: "Own the studio billboard lane." },
  { id: "prime_takeover", label: "Prime Takeover", multiplier: "4x", min: 150, description: "Trigger takeover-level visual dominance." },
];

export default function PlaceBidButton({ songId, currentBidPower = 0, rankScore = 0 }: { songId: string; currentBidPower?: number; rankScore?: number }) {
  const [open, setOpen] = useState(false);
  const [amountUsd, setAmountUsd] = useState(50);
  const [placement, setPlacement] = useState<Placement>("premium_screen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PLACEMENTS.find((item) => item.id === placement) ?? PLACEMENTS[0];
  const estimatedPower = Math.round(amountUsd * (placement === "prime_takeover" ? 4 : placement === "billboard" ? 2 : 1));

  async function submitBid() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/placements/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, amountUsd, placement }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error ?? "Could not start bid checkout.");
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start bid checkout.");
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent-300/35 bg-accent-300/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-accent-100 transition hover:bg-accent-300 hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
      >
        Place Bid
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/12 bg-[#06070d] p-5 shadow-2xl shadow-black/80">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent-200">Auction placement bid</p>
                <h3 className="mt-1 text-2xl font-black text-white">Win visibility now</h3>
                <p className="mt-2 text-sm leading-6 text-white/48">Bids charge through Stripe first. After payment clears, bid power is applied to ranking and 3D wall dominance.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/60 hover:text-white">Close</button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/38">Current bid power</p>
                <p className="mt-1 text-2xl font-black text-white">{currentBidPower.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl border border-gold-300/20 bg-gold-300/10 p-3">
                <p className="text-xs text-white/38">Rank score</p>
                <p className="mt-1 text-2xl font-black text-gold-100">{rankScore.toFixed(1)}</p>
              </div>
            </div>

            <label className="mb-4 block">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/38">Bid amount</span>
              <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-black/45 px-4">
                <span className="text-white/45">$</span>
                <input
                  type="number"
                  min={selected.min}
                  max={10000}
                  value={amountUsd}
                  onChange={(event) => setAmountUsd(Number(event.target.value))}
                  className="min-h-12 w-full bg-transparent px-2 text-lg font-black text-white outline-none"
                />
              </div>
              <span className="mt-1 block text-xs text-white/35">Minimum for {selected.label}: ${selected.min}</span>
            </label>

            <div className="mb-4 grid gap-2">
              {PLACEMENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPlacement(item.id);
                    setAmountUsd((value) => Math.max(value, item.min));
                  }}
                  className={`rounded-2xl border p-3 text-left transition ${placement === item.id ? "border-accent-300 bg-accent-300/12" : "border-white/10 bg-white/[0.035] hover:border-white/25"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-white">{item.label}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black text-accent-100">{item.multiplier} power</span>
                  </div>
                  <p className="mt-1 text-xs text-white/45">{item.description}</p>
                </button>
              ))}
            </div>

            <div className="mb-4 rounded-2xl border border-gold-300/20 bg-gold-300/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-white/70">Estimated bid power</span>
                <span className="text-2xl font-black text-gold-100">+{estimatedPower}</span>
              </div>
              <p className="mt-1 text-xs text-white/45">Auction closes in 23:59:59 unless another bidder pushes the wall harder.</p>
            </div>

            {error && <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

            <button
              type="button"
              disabled={loading || amountUsd < selected.min}
              onClick={submitBid}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-accent-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Opening Stripe..." : "Bid with Stripe"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
