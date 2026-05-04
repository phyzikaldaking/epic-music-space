"use client";

import { useState } from "react";

interface Prefill {
  email: string;
  name: string;
}

export default function SupportForm({ prefill }: { prefill: Prefill | null }) {
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [name, setName] = useState(prefill?.name ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, subject, body }),
      });
      const data = (await res.json()) as { ok?: boolean; ticketCode?: string; error?: string };
      if (!res.ok || !data.ticketCode) {
        throw new Error(data.error ?? "Could not open the ticket. Please try again.");
      }
      setTicketCode(data.ticketCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ticketCode) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/6 p-6">
        <p className="text-2xl">✅</p>
        <h2 className="mt-3 text-xl font-bold">Got it</h2>
        <p className="mt-2 text-sm text-white/70">
          Your ticket is{" "}
          <code className="rounded bg-white/10 px-2 py-0.5 font-mono text-xs text-brand-300">
            {ticketCode}
          </code>
          . We&apos;ve sent a confirmation to {email}. We respond within one business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm focus:border-brand-500/60 focus:outline-none"
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Name (optional)
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm focus:border-brand-500/60 focus:outline-none"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
          Subject
        </span>
        <input
          type="text"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm focus:border-brand-500/60 focus:outline-none"
          placeholder="e.g. License download not working"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
          Message
        </span>
        <textarea
          required
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm focus:border-brand-500/60 focus:outline-none"
          placeholder="Tell us what's happening, what you expected, and any links/screenshots…"
        />
      </label>
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
      >
        {submitting ? "Sending…" : "Send ticket"}
      </button>
    </form>
  );
}
