"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const TIERS = [
  {
    key: "starter",
    name: "Starter",
    monthlyUsd: 9,
    badge: null,
    description: "For listeners who want to participate in the EMS economy.",
    features: [
      "Unlimited song streaming",
      "Up to 5 active licenses",
      "Versus voting",
      "Basic leaderboard access",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 29,
    badge: "Popular",
    description: "For serious fans and emerging artists.",
    features: [
      "Everything in Starter",
      "Up to 25 active licenses",
      "Song upload (up to 10 songs)",
      "AI score insights",
      "Studio profile + district badge",
    ],
  },
  {
    key: "prime",
    name: "Prime",
    monthlyUsd: 79,
    badge: "Best value",
    description: "For professional artists building their brand.",
    features: [
      "Everything in Pro",
      "Unlimited licenses",
      "Unlimited song uploads",
      "Priority AI scoring",
      "Versus match creation",
      "Downtown Prime district access",
      "Analytics dashboard",
    ],
  },
  {
    key: "label",
    name: "Label",
    monthlyUsd: 199,
    badge: "Enterprise",
    description: "Run your own music label and sign artists.",
    features: [
      "Everything in Prime",
      "Create & manage a label",
      "Sign up to 20 artists",
      "Label Row district access",
      "City billboard ad slots",
      "Stripe Connect payout dashboard",
      "Priority support",
    ],
  },
] as const;

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSubscribed = searchParams.get("subscribed");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function subscribe(tier: string) {
    setError("");
    setLoading(tier);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/auth/signin?callbackUrl=/pricing");
          return;
        }
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-20">
      {/* Header */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-extrabold md:text-5xl">
          <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
            Choose your tier
          </span>
        </h1>
        <p className="mt-3 text-lg text-white/50">
          Unlock more of the EMS economy. Cancel anytime.
        </p>
      </div>

      {/* Success banner */}
      {justSubscribed && (
        <div className="mb-10 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-center text-green-400">
          🎉 You&apos;re now on the{" "}
          <strong className="capitalize">{justSubscribed}</strong> plan! Check
          your dashboard for new features.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/20 px-5 py-3 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Tiers grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.key}
            className={`relative flex flex-col rounded-2xl border p-6 transition ${
              tier.key === "prime"
                ? "border-brand-500 bg-brand-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            {tier.badge && (
              <span
                className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold ${
                  tier.key === "prime"
                    ? "bg-brand-500 text-white"
                    : "bg-white/20 text-white"
                }`}
              >
                {tier.badge}
              </span>
            )}

            <div className="mb-4">
              <h2 className="text-xl font-bold">{tier.name}</h2>
              <p className="mt-1 text-sm text-white/50">{tier.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-extrabold">${tier.monthlyUsd}</span>
              <span className="ml-1 text-white/40">/month</span>
            </div>

            <ul className="mb-8 flex-1 space-y-2.5">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                  <span className="mt-0.5 text-brand-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => subscribe(tier.key)}
              disabled={loading === tier.key}
              className={`w-full rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                tier.key === "prime"
                  ? "bg-brand-500 hover:bg-brand-600"
                  : "border border-white/20 hover:bg-white/10"
              }`}
            >
              {loading === tier.key ? "Redirecting…" : `Get ${tier.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <p className="mt-12 text-center text-xs text-white/30">
        Payments are processed securely by Stripe. EMS subscription fees do not
        constitute investment products. Revenue participation is governed by the{" "}
        <a href="/legal/licensing" className="underline hover:text-white/60">
          Digital Music Licensing Agreement
        </a>
        .
      </p>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}
