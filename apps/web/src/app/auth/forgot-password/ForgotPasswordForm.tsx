"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always treat the response as success — the API never reveals whether
      // the email exists, and we don't want to either.
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/8 p-6">
        <p className="text-2xl">📧</p>
        <h2 className="mt-2 text-lg font-bold">Check your email</h2>
        <p className="mt-1 text-sm text-white/65">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          reset link. The link expires in 30 minutes.
        </p>
        <Link
          href="/auth/signin"
          className="mt-4 inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/45">
          Email
        </span>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-xs text-white/40">
        Remember it?{" "}
        <Link href="/auth/signin" className="text-brand-400 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
