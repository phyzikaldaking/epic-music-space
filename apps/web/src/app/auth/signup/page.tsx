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
    sub: "Upload songs & earn royalties",
    accent: "brand",
    border: "border-brand-500/50",
    bg: "bg-brand-500/10",
    ring: "ring-brand-500",
    textAccent: "text-brand-400",
  },
  {
    value: "LISTENER",
    icon: "🎧",
    label: "Fan / Listener",
    sub: "License music & earn revenue share",
    accent: "cyan",
    border: "border-accent-500/50",
    bg: "bg-accent-500/8",
    ring: "ring-accent-500",
    textAccent: "text-accent-400",
  },
  {
    value: "LABEL",
    icon: "📢",
    label: "Brand / Label",
    sub: "Advertise & sign artists",
    accent: "gold",
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Read invite code from URL param
  const inviteCode = searchParams.get("invite") ?? "";

  // Pre-select role from query param (e.g. ?role=ARTIST from homepage CTA)
  useEffect(() => {
    const r = searchParams.get("role") as RoleValue | null;
    if (r && ROLES.some((ro) => ro.value === r)) setSelectedRole(r);
  }, [searchParams]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

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
            <div className="grid grid-cols-3 gap-3">
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

