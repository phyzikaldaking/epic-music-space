"use client";

import { useState } from "react";

type PackageId = "premium_screen" | "billboard" | "prime_takeover";

const PACKAGES: Array<{ id: PackageId; label: string; price: string; description: string }> = [
  { id: "premium_screen", label: "Premium Screen", price: "$49", description: "Rise on the 3D wall for 7 days." },
  { id: "billboard", label: "3D Billboard", price: "$149", description: "Own the studio billboard slot." },
  { id: "prime_takeover", label: "Prime Takeover", price: "$299", description: "Highest-intent wall placement." },
];

export default function PromoteSongButton({ songId }: { songId: string }) {
  const [open, setOpen] = useState(false);
  const [loadingPackage, setLoadingPackage] = useState<PackageId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(packageId: PackageId) {
    setError(null);
    setLoadingPackage(packageId);
    try {
      const response = await fetch("/api/placements/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, packageId }),
      });
      const data = await response.json();
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "Could not start placement checkout.");
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoadingPackage(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-gold-300/35 bg-gold-300/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-gold-100 transition hover:bg-gold-300 hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
      >
        Promote
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-3 w-80 overflow-hidden rounded-2xl border border-white/12 bg-black/95 p-3 shadow-2xl shadow-black/70 backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-200">Paid placement</p>
              <p className="text-sm text-white/48">Compete for premium wall attention.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/55 hover:text-white">
              Close
            </button>
          </div>

          <div className="grid gap-2">
            {PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                disabled={loadingPackage !== null}
                onClick={() => checkout(pkg.id)}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-gold-300/40 hover:bg-gold-300/10 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-white">{pkg.label}</span>
                  <span className="font-black text-gold-200">{loadingPackage === pkg.id ? "Starting..." : pkg.price}</span>
                </div>
                <p className="mt-1 text-xs text-white/45">{pkg.description}</p>
              </button>
            ))}
          </div>

          {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        </div>
      )}
    </div>
  );
}
