"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const TIERS = [
  {
    key: "starter",
    name: "Starter",
    monthlyUsd: 9,
    badge: null,
    icon: "🎧",
    description: "For listeners who want to participate in the EMS economy.",
    features: [
      "Unlimited song streaming",
      "Up to 5 active licenses",
      "Versus voting",
      "Basic leaderboard access",
    ],
    highlight: false,
    ctaClass: "border border-white/15 hover:bg-white/8 text-white",
    cardClass: "border-white/8 bg-[#141414]",
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 29,
    badge: "Popular",
    icon: "🎤",
    description: "For serious fans and emerging artists.",
    features: [
      "Everything in Starter",
      "Up to 25 active licenses",
      "Song upload (up to 10 songs)",
      "AI score insights",
      "Studio profile + district badge",
      "Versus battle creation",
    ],
    highlight: false,
    ctaClass:
      "border border-brand-500/50 bg-brand-500/15 text-brand-400 hover:bg-brand-500/25",
    cardClass: "border-brand-500/25 bg-[#141414]",
  },
  {
    key: "prime",
    name: "Prime",
    monthlyUsd: 79,
    badge: "Best value",
    icon: "🏆",
    description: "For professional artists building their brand.",
    features: [
      "Everything in Pro",
      "Unlimited licenses",
      "Unlimited song uploads",
      "Priority AI scoring",
      "Versus match creation",
      "Mainstage Circuit access",
      "Full analytics dashboard",
    ],
    highlight: true,
    ctaClass: "bg-brand-500 hover:bg-brand-600 text-white glow-purple-sm",
    cardClass: "border-brand-500/60 bg-brand-500/10 glow-purple",
  },
  {
    key: "team",
    name: "Team",
    monthlyUsd: 99,
    badge: "Teams",
    icon: "🤝",
    description: "For creative teams managing releases together.",
    features: [
      "Everything in Prime",
      "Team-ready release operations",
      "Shared artist workflow support",
      "Priority AI scoring queue",
      "Full analytics dashboard",
      "Priority support",
    ],
    highlight: false,
    ctaClass:
      "border border-accent-400/50 bg-accent-400/10 text-accent-300 hover:bg-accent-400/20",
    cardClass: "border-accent-400/25 bg-[#141414]",
  },
  {
    key: "label",
    name: "Label",
    monthlyUsd: 199,
    badge: "Enterprise",
    icon: "👑",
    description: "Run your own music label and sign artists.",
    features: [
      "Everything in Prime",
      "Create & manage a label",
      "Sign up to 20 artists",
      "Platinum Heights access",
      "Studio billboard ad slots",
      "Stripe Connect payout dashboard",
      "Priority support",
    ],
    highlight: false,
    ctaClass:
      "border border-gold-500/50 bg-gold-500/10 text-gold-400 hover:bg-gold-500/20",
    cardClass: "border-gold-500/25 bg-[#141414]",
  },
] as const;

const TRIAL_FEATURES = [
  "Upload up to 10 songs",
  "Up to 25 active licenses",
  "AI score insights",
  "Versus battle creation",
  "Studio profile + district badge",
  "Full analytics dashboard",
];

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSubscribed = searchParams.get("subscribed");
  const trialStarted = searchParams.get("trial");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [trialSuccess, setTrialSuccess] = useState(false);

  async function startTrial() {
    setError("");
    setLoading("trial");
    try {
      const res = await fetch("/api/trial/start", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/auth/signin?callbackUrl=/pricing?trial=1");
          return;
        }
        setError(data.error ?? "Could not start trial.");
        return;
      }
      setTrialSuccess(true);
      // Redirect to dashboard after a short delay so users see the success
      setTimeout(() => router.push("/dashboard?trial=started"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function subscribe(tier: string) {
    setError("");
    setLoading(tier);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json() as { checkoutUrl?: string; error?: string };
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
    <div className="relative min-h-screen">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-brand-500/12 blur-[130px]" />

      <div className="relative mx-auto max-w-7xl px-4 py-20">
        {/* ── Header ────────────────────────────────────── */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-4 py-1.5 text-xs font-semibold text-brand-400 uppercase tracking-widest">
            🏆 Upgrade your EMS experience
          </div>
          <h1 className="text-4xl font-extrabold md:text-6xl">
            <span className="text-gradient-ems">Choose your tier</span>
          </h1>
          <p className="mt-4 text-lg text-white/45">
            Unlock more of the EMS economy. Cancel anytime.
          </p>
        </div>

        {/* ── Free Trial Hero ────────────────────────────── */}
        {!trialSuccess ? (
          <div className="mb-14 overflow-hidden rounded-3xl border border-brand-500/40 bg-gradient-to-br from-brand-500/15 via-[#141414] to-accent-500/10">
            <div className="flex flex-col items-center gap-8 p-8 md:flex-row md:p-10">
              <div className="flex-1">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-400 uppercase tracking-widest">
                  ✦ No credit card required
                </div>
                <h2 className="text-3xl font-extrabold md:text-4xl">
                  Try Pro <span className="text-gradient-ems">free for 7 days</span>
                </h2>
                <p className="mt-2 text-white/55">
                  Get full Pro access — upload beats, set licenses, battle on Versus.
                  No card. No catch. Cancel or upgrade anytime.
                </p>
                <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
                  {TRIAL_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                      <span className="text-brand-400 font-bold">✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => void startTrial()}
                  disabled={loading === "trial"}
                  className="rounded-2xl bg-brand-500 px-8 py-4 text-base font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50 glow-purple min-w-[220px]"
                >
                  {loading === "trial" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Starting…
                    </span>
                  ) : (
                    "Start Free Trial →"
                  )}
                </button>
                <p className="text-xs text-white/30">
                  7 days free · then $29/mo · cancel anytime
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-14 rounded-3xl border border-green-500/30 bg-green-500/10 p-8 text-center">
            <p className="text-2xl font-extrabold text-green-400">🎉 Trial activated!</p>
            <p className="mt-2 text-white/60">Redirecting you to your dashboard…</p>
          </div>
        )}

        {/* Success banners */}
        {justSubscribed && (
          <div className="mb-10 rounded-2xl border border-green-500/25 bg-green-500/10 px-5 py-4 text-center text-green-400">
            🎉 You&apos;re now on the{" "}
            <strong className="capitalize">{justSubscribed}</strong> plan! Check
            your dashboard for new features.
          </div>
        )}
        {trialStarted && (
          <div className="mb-10 rounded-2xl border border-brand-500/25 bg-brand-500/10 px-5 py-4 text-center text-brand-300">
            ⚡ Your 7-day Pro trial is active! Explore all features from your dashboard.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/25 bg-red-500/15 px-5 py-3 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ── Tiers grid ────────────────────────────────── */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`relative flex flex-col rounded-2xl border p-6 transition ${tier.cardClass}`}
            >
              {/* Featured glow ring */}
              {tier.highlight && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-brand-500/50 ring-offset-0" />
              )}

              {/* Badge */}
              {tier.badge && (
                <span
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-0.5 text-xs font-bold tracking-wide ${
                    tier.highlight
                      ? "bg-brand-500 text-white"
                      : tier.key === "team"
                        ? "bg-accent-400 text-[#0a0a0a]"
                        : tier.key === "label"
                          ? "bg-gold-500 text-[#0a0a0a]"
                          : "bg-white/15 text-white"
                  }`}
                >
                  {tier.badge}
                </span>
              )}

              {/* Icon + name */}
              <div className="mb-4 flex items-center gap-3">
                <span className="text-3xl">{tier.icon}</span>
                <div>
                  <h2 className="text-xl font-extrabold">{tier.name}</h2>
                  <p className="text-xs text-white/40">{tier.description}</p>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                <span
                  className={`text-5xl font-black ${
                    tier.highlight
                      ? "text-gradient-ems"
                      : tier.key === "team"
                        ? "text-accent-300"
                        : tier.key === "label"
                          ? "text-gradient-gold"
                          : ""
                  }`}
                >
                  ${tier.monthlyUsd}
                </span>
                <span className="ml-1 text-sm text-white/35">/month</span>
              </div>

              {/* Features */}
              <ul className="mb-8 flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-white/65"
                  >
                    <span
                      className={`mt-0.5 text-xs font-bold ${
                        tier.highlight
                          ? "text-brand-400"
                          : tier.key === "team"
                            ? "text-accent-300"
                            : tier.key === "label"
                              ? "text-gold-400"
                              : "text-white/40"
                      }`}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void subscribe(tier.key)}
                disabled={loading === tier.key}
                className={`w-full rounded-xl py-3 text-sm font-bold transition disabled:opacity-50 ${tier.ctaClass}`}
              >
                {loading === tier.key ? "Redirecting…" : `Get ${tier.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="mt-14 text-center text-xs text-white/25">
          Payments are processed securely by Stripe. EMS subscription fees do
          not constitute investment products. Revenue participation is governed
          by the{" "}
          <Link href="/legal/licensing" className="underline hover:text-white/50">
            Digital Music Licensing Agreement
          </Link>
          .
        </p>
      </div>
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
