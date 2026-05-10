"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@ems/utils";
import {
  clearCheckoutRecoveryIntent,
  loadCheckoutRecoveryIntent,
  type CheckoutRecoveryIntent,
} from "@/lib/payments/checkoutRecovery";

type Props = {
  songId: string;
  ctaId?: string;
  checkoutState?: "success" | "cancelled" | string | undefined;
};

function formatStartedAt(iso: string) {
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return null;
  return started.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CheckoutRecoveryBanner({ songId, ctaId = "license-cta", checkoutState }: Props) {
  const router = useRouter();
  const [intent, setIntent] = useState<CheckoutRecoveryIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadCheckoutRecoveryIntent();
    if (!saved) return;
    if (checkoutState === "success") {
      clearCheckoutRecoveryIntent();
      return;
    }
    if (saved.songId !== songId) return;
    setIntent(saved);
  }, [songId, checkoutState]);

  const startedAt = useMemo(() => (intent ? formatStartedAt(intent.startedAt) : null), [intent]);

  async function resumeCheckout() {
    if (!intent) return;
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        songId: intent.songId,
        eulaAccepted: true,
      };
      if (intent.mode === "tier" && intent.tierId && intent.tierId !== "__base__") {
        payload.licenseTierId = intent.tierId;
      } else if (intent.mode === "pwyw") {
        payload.customAmount = intent.amountUsd;
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.push(`/auth/signin?callbackUrl=/track/${intent.songId}`);
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
      throw new Error(parsed.error ?? "Could not resume checkout.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume checkout.");
    } finally {
      setLoading(false);
    }
  }

  function scrollToCta() {
    const el = document.getElementById(ctaId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  if (!intent) return null;

  return (
    <div className="mb-6 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-5 py-4 text-sm text-brand-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-200/85">
            Checkout recovered
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            You were partway through this license.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/70">
            {intent.mode === "tier"
              ? `Resume the ${intent.tierName ?? "selected"} tier for ${formatPrice(intent.amountUsd)}.`
              : `Resume the ${intent.mode === "pwyw" ? "custom" : "standard"} checkout for ${formatPrice(intent.amountUsd)}.`}
            {startedAt ? ` Started ${startedAt}.` : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-100/70">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {intent.source.replace("_", " ")}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {intent.mode}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {formatPrice(intent.amountUsd)}
            </span>
          </div>
          {error && (
            <p className="mt-3 text-xs font-semibold text-yellow-100">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void resumeCheckout()}
            disabled={loading}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? "Resuming…" : "Resume checkout"}
          </button>
          <button
            type="button"
            onClick={scrollToCta}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/10"
          >
            Back to license
          </button>
          <button
            type="button"
            onClick={() => {
              clearCheckoutRecoveryIntent();
              setIntent(null);
            }}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/55 transition hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
