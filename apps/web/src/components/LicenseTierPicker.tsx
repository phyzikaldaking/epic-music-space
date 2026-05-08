"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";

export type LicenseTierOption = {
  id: string;
  name: string;
  priceUsd: number;
  terms?: string;
};

type Props = {
  songId: string;
  basePrice: number;
  variants: LicenseTierOption[];
};

/**
 * Tiered licensing picker. Renders the BASIC tier (the song's top-level
 * licensePrice) plus every entry in `variants`. Selecting a tier and
 * clicking "License" POSTs to /api/checkout with `licenseTierId` so the
 * server can override the line-item price for that purchase.
 */
export default function LicenseTierPicker({ songId, basePrice, variants }: Props) {
  // The base tier is implicit — it's the existing licensePrice. We expose
  // it as the first row so the buyer always has the cheapest option in
  // sight without having to scan past it.
  const allTiers: (LicenseTierOption & { isBase: boolean })[] = [
    { id: "__base__", name: "Basic", priceUsd: basePrice, isBase: true },
    ...variants.map((v) => ({ ...v, isBase: false })),
  ];

  const [selected, setSelected] = useState<string>(allTiers[0].id);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { error } = useToast();

  async function buy() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songId,
          ...(selected !== "__base__" ? { licenseTierId: selected } : {}),
        }),
      });
      if (res.status === 401) {
        router.push("/auth/signin");
        return;
      }
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { checkoutUrl?: string };
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }
      const text = await res.text().catch(() => "");
      const parsed = JSON.parse(text || "{}") as { error?: string };
      error(parsed.error ?? "Could not start checkout. Please try again.");
    } catch {
      error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl studio-faceplate p-4">
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
        <p className="studio-label text-white/65">Select License</p>
        <span className="studio-label ml-auto text-white/35">CH-LIC</span>
      </div>
      <div className="space-y-1.5">
        {allTiers.map((tier) => {
          const isSelected = selected === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => setSelected(tier.id)}
              className={`w-full rounded-md p-3 text-left transition ${
                isSelected
                  ? "studio-faceplate-dark shadow-[inset_0_0_0_1px_rgba(255,176,74,0.45),0_0_12px_rgba(255,138,30,0.18)]"
                  : "bg-black/30 hover:bg-black/40"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Channel-select LED on the left of each row. */}
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    isSelected ? "led-on-amber" : "led-off"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base uppercase tracking-wider text-white/90">
                    {tier.name}
                  </p>
                  {tier.terms && (
                    <p className="mt-0.5 text-xs text-white/55 line-clamp-2">
                      {tier.terms}
                    </p>
                  )}
                </div>
                <span className="text-readout-amber tabular-nums text-lg font-bold">
                  ${tier.priceUsd.toFixed(2)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={buy}
        disabled={loading}
        className="mt-4 w-full rounded-md py-3 font-display text-base uppercase tracking-[0.18em] transition disabled:opacity-60"
        style={{
          background:
            "linear-gradient(180deg, #2a1d14 0%, #1a110b 50%, #140d08 100%)",
          color: "#ffd28a",
          boxShadow:
            "inset 0 1px 0 rgba(255,210,138,0.25), inset 0 -2px 4px rgba(0,0,0,0.7), 0 2px 6px rgba(0,0,0,0.5), 0 0 14px rgba(255,138,30,0.18)",
          textShadow: "0 0 6px rgba(255,176,74,0.55)",
        }}
      >
        {loading ? "Starting…" : "Engage License"}
      </button>
    </div>
  );
}
