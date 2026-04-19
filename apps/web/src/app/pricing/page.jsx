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
        ],
        highlight: false,
        ctaClass: "border border-brand-500/50 bg-brand-500/15 text-brand-400 hover:bg-brand-500/25",
        cardClass: "border-brand-500/25 bg-[#141414]",
    },
    {
        key: "prime",
        name: "Prime",
        monthlyUsd: 49,
        badge: "Best value",
        icon: "🏆",
        description: "For professional artists building their brand.",
        features: [
            "Everything in Pro",
            "Unlimited licenses",
            "Unlimited song uploads",
            "Priority AI scoring",
            "Versus match creation",
            "Downtown Prime district access",
            "Full analytics dashboard",
        ],
        highlight: true,
        ctaClass: "bg-brand-500 hover:bg-brand-600 text-white glow-purple-sm",
        cardClass: "border-brand-500/60 bg-brand-500/10 glow-purple",
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
            "Label Row district access",
            "City billboard ad slots",
            "Stripe Connect payout dashboard",
            "Priority support",
        ],
        highlight: false,
        ctaClass: "border border-gold-500/50 bg-gold-500/10 text-gold-400 hover:bg-gold-500/20",
        cardClass: "border-gold-500/25 bg-[#141414]",
    },
];
function PricingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const justSubscribed = searchParams.get("subscribed");
    const [loading, setLoading] = useState(null);
    const [error, setError] = useState("");
    async function subscribe(tier) {
        var _a;
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
                setError((_a = data.error) !== null && _a !== void 0 ? _a : "Something went wrong.");
                return;
            }
            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            }
        }
        catch (_b) {
            setError("Network error. Please try again.");
        }
        finally {
            setLoading(null);
        }
    }
    return (<div className="relative min-h-screen">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-brand-500/12 blur-[130px]"/>

      <div className="relative mx-auto max-w-7xl px-4 py-20">
        {/* ── Header ────────────────────────────────────── */}
        <div className="mb-16 text-center">
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

        {/* Success banner */}
        {justSubscribed && (<div className="mb-10 rounded-2xl border border-green-500/25 bg-green-500/10 px-5 py-4 text-center text-green-400">
            🎉 You&apos;re now on the{" "}
            <strong className="capitalize">{justSubscribed}</strong> plan! Check
            your dashboard for new features.
          </div>)}

        {error && (<div className="mb-6 rounded-2xl border border-red-500/25 bg-red-500/15 px-5 py-3 text-center text-sm text-red-400">
            {error}
          </div>)}

        {/* ── Tiers grid ────────────────────────────────── */}
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((tier) => (<div key={tier.key} className={`relative flex flex-col rounded-2xl border p-6 transition ${tier.cardClass}`}>
              {/* Featured glow ring */}
              {tier.highlight && (<div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-brand-500/50 ring-offset-0"/>)}

              {/* Badge */}
              {tier.badge && (<span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-0.5 text-xs font-bold tracking-wide ${tier.highlight
                    ? "bg-brand-500 text-white"
                    : tier.key === "label"
                        ? "bg-gold-500 text-[#0a0a0a]"
                        : "bg-white/15 text-white"}`}>
                  {tier.badge}
                </span>)}

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
                <span className={`text-5xl font-black ${tier.highlight
                ? "text-gradient-ems"
                : tier.key === "label"
                    ? "text-gradient-gold"
                    : ""}`}>
                  ${tier.monthlyUsd}
                </span>
                <span className="ml-1 text-sm text-white/35">/month</span>
              </div>

              {/* Features */}
              <ul className="mb-8 flex-1 space-y-2.5">
                {tier.features.map((f) => (<li key={f} className="flex items-start gap-2 text-sm text-white/65">
                    <span className={`mt-0.5 text-xs font-bold ${tier.highlight
                    ? "text-brand-400"
                    : tier.key === "label"
                        ? "text-gold-400"
                        : "text-white/40"}`}>
                      ✓
                    </span>
                    {f}
                  </li>))}
              </ul>

              <button onClick={() => subscribe(tier.key)} disabled={loading === tier.key} className={`w-full rounded-xl py-3 text-sm font-bold transition disabled:opacity-50 ${tier.ctaClass}`}>
                {loading === tier.key ? "Redirecting…" : `Get ${tier.name}`}
              </button>
            </div>))}
        </div>

        {/* Footer */}
        <p className="mt-14 text-center text-xs text-white/25">
          Payments are processed securely by Stripe. EMS subscription fees do not
          constitute investment products. Revenue participation is governed by the{" "}
          <a href="/legal/licensing" className="underline hover:text-white/50">
            Digital Music Licensing Agreement
          </a>
          .
        </p>
      </div>
    </div>);
}
export default function PricingPage() {
    return (<Suspense>
      <PricingContent />
    </Suspense>);
}
