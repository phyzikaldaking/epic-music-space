"use client";

import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr("Couldn't send the reset email. Try again in a minute.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 px-5 py-6 text-center text-sm">
        <p className="font-bold text-brand-200">Check your inbox.</p>
        <p className="mt-2 text-white/60">
          If an account exists for that email, a reset link is on its way. The link expires in 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/60 focus:ring-1 focus:ring-brand-500/40"
        />
      </div>
      {err && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
