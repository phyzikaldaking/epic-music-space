"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ROLES = [
  {
    value: "ARTIST",
    icon: "🎤",
    label: "Artist",
    sub: "Upload songs, earn royalties",
    border: "border-brand-500/50",
    bg: "bg-brand-500/10",
    ring: "ring-brand-500",
    textAccent: "text-brand-400",
  },
  {
    value: "PRODUCER",
    icon: "🎛️",
    label: "Producer",
    sub: "Sell beats, kits, templates",
    border: "border-orange-500/50",
    bg: "bg-orange-500/8",
    ring: "ring-orange-500",
    textAccent: "text-orange-400",
  },
  {
    value: "ENGINEER",
    icon: "🎚️",
    label: "Engineer",
    sub: "Offer mixing & mastering",
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/8",
    ring: "ring-emerald-500",
    textAccent: "text-emerald-400",
  },
  {
    value: "LISTENER",
    icon: "🎧",
    label: "Fan / Listener",
    sub: "Find tracks, back artists",
    border: "border-accent-500/50",
    bg: "bg-accent-500/8",
    ring: "ring-accent-500",
    textAccent: "text-accent-400",
  },
  {
    value: "LABEL",
    icon: "🏷️",
    label: "Label",
    sub: "Sign artists, run a roster",
    border: "border-gold-500/50",
    bg: "bg-gold-500/8",
    ring: "ring-gold-500",
    textAccent: "text-gold-400",
  },
] as const;

type RoleValue = typeof ROLES[number]["value"];

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedRole, setSelectedRole] = useState<RoleValue>("LISTENER");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [buyerGuide, setBuyerGuide] = useState({
    mood: "Cinematic",
    useCase: "Trailer",
    budget: "$100-$300",
    licenseType: "Social + Ads",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskChecks, setTaskChecks] = useState<Record<string, boolean>>({});

  // Read invite code from URL param
  const inviteCode = searchParams.get("invite") ?? "";

  // Pre-select role from query param (e.g. ?role=ARTIST from homepage CTA)
  useEffect(() => {
    const r = searchParams.get("role") as RoleValue | null;
    if (r && ROLES.some((ro) => ro.value === r)) setSelectedRole(r);
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "funnel_visitor_to_signup_view",
      }),
    }).catch(() => null);
  }, []);

  useEffect(() => {
    void fetch("/api/analytics/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "funnel_signup_role_selected",
        role: selectedRole,
      }),
    }).catch(() => null);
  }, [selectedRole]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const roleTasks =
    selectedRole === "ARTIST"
      ? ["Create profile", "Upload first song", "Set price"]
      : selectedRole === "PRODUCER"
      ? ["List a beat or template", "Set price", "Connect Stripe payouts"]
      : selectedRole === "ENGINEER"
      ? ["List mix / master service", "Set delivery time", "Connect Stripe payouts"]
      : selectedRole === "LABEL"
      ? ["Create label profile", "Invite first artist", "Launch campaign"]
      : ["Save first search", "Watchlist 3 tracks", "License first track"];

  const completedTasks = roleTasks.filter((task) => taskChecks[task]).length;
  const taskProgressPct = Math.round((completedTasks / roleTasks.length) * 100);
  const taskProgressWidthClass =
    taskProgressPct >= 100 ? "w-full" : taskProgressPct >= 67 ? "w-2/3" : taskProgressPct >= 34 ? "w-1/3" : "w-0";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: selectedRole, inviteCode: inviteCode || undefined }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    if (data.verificationEmailSent === false) {
      // Email not sent — redirect to verify page with flag so user can resend
      router.push(`/auth/verify-email?email=${encodeURIComponent(form.email)}&emailFailed=1`);
      return;
    }

    router.push(`/auth/verify-email?email=${encodeURIComponent(form.email)}`);
  }

  return (
    <div className="flex min-h-[88vh] items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-500/12 blur-[120px]" />

      <div className="relative w-full max-w-lg">
        <div className="glass-card rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold">
              Join <span className="text-gradient-ems">Epic Music Space</span>
            </h1>
            <p className="mt-2 text-sm text-white/45">
              Free to start — no credit card required
            </p>
            {inviteCode && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/8 px-3 py-1.5">
                <span className="text-green-400 text-sm">🤝</span>
                <p className="text-xs text-green-300 font-semibold">Invited with code <code>{inviteCode}</code></p>
              </div>
            )}
          </div>

          {/* Role selector */}
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
              I am a…
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
                    selectedRole === role.value
                      ? `${role.border} ${role.bg} ring-1 ${role.ring}/40`
                      : "border-white/8 bg-white/3 hover:bg-white/6"
                  }`}
                >
                  <span className="text-2xl">{role.icon}</span>
                  <span className={`text-xs font-bold ${selectedRole === role.value ? role.textAccent : "text-white/60"}`}>
                    {role.label}
                  </span>
                  <span className="text-[10px] text-white/35 leading-tight">
                    {role.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            {selectedRole === "ARTIST" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Artist quick start</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">1. Profile</div>
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">2. Upload</div>
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">3. Pricing</div>
                </div>
              </>
            ) : selectedRole === "PRODUCER" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Producer storefront</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">List beats &amp; templates</div>
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">Instant download</div>
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">Keep 90%</div>
                </div>
              </>
            ) : selectedRole === "ENGINEER" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Engineer services</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Mixing</div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Mastering</div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Templates &amp; lessons</div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Buyer guided discovery</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    aria-label="Preferred mood"
                    value={buyerGuide.mood}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, mood: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Cinematic</option>
                    <option>Synthwave</option>
                    <option>Dark Trap</option>
                    <option>Ambient</option>
                  </select>
                  <select
                    aria-label="Primary use case"
                    value={buyerGuide.useCase}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, useCase: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Trailer</option>
                    <option>YouTube</option>
                    <option>Podcast</option>
                    <option>Game</option>
                  </select>
                  <select
                    aria-label="Budget range"
                    value={buyerGuide.budget}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, budget: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>$0-$100</option>
                    <option>$100-$300</option>
                    <option>$300-$700</option>
                    <option>$700+</option>
                  </select>
                  <select
                    aria-label="License type"
                    value={buyerGuide.licenseType}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, licenseType: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Social + Ads</option>
                    <option>Broadcast</option>
                    <option>Exclusive</option>
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/marketplace"
                    className="rounded-lg border border-accent-500/35 bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-300 hover:bg-accent-500/20"
                  >
                    One-click sample pack
                  </Link>
                  <Link
                    href="/marketplace"
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                  >
                    Featured stems in 60 seconds
                  </Link>
                </div>
              </>
            )}

            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/55">
                <span className="uppercase tracking-[0.16em]">First session checklist</span>
                <span>{taskProgressPct}%</span>
              </div>
              <div className="mb-3 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all ${taskProgressWidthClass}`}
                />
              </div>
              <div className="space-y-2">
                {roleTasks.map((task) => (
                  <label key={task} className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(taskChecks[task])}
                      onChange={(e) =>
                        setTaskChecks((prev) => ({
                          ...prev,
                          [task]: e.target.checked,
                        }))
                      }
                    />
                    <span>{task}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/15 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Name
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Email
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="Min. 8 characters"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-brand-500 py-3 font-bold text-white transition hover:bg-brand-600 disabled:opacity-50 glow-purple-sm"
            >
              {loading ? "Creating account…" : "Create account →"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/35">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-brand-400 hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-white/20">
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/45">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-white/45">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-white/60 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Secure checkout</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Plain-language license terms</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Weekly payout schedule</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}

