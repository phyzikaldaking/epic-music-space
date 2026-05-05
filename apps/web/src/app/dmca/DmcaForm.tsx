"use client";

import { useState } from "react";

export default function DmcaForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const formData = new FormData(e.currentTarget);
    const payload = {
      complainantName: String(formData.get("name") ?? "").trim(),
      complainantEmail: String(formData.get("email") ?? "").trim(),
      complainantAddress: String(formData.get("address") ?? "").trim(),
      copyrightedWork: String(formData.get("work") ?? "").trim(),
      infringingUrl: String(formData.get("infringingUrl") ?? "").trim(),
      goodFaithStatement: formData.get("goodFaith") === "on",
      perjuryStatement: formData.get("perjury") === "on",
      signature: String(formData.get("signature") ?? "").trim(),
    };
    if (!payload.goodFaithStatement || !payload.perjuryStatement) {
      setError("Both statements are required by 17 U.S.C. § 512(c)(3).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dmca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="not-prose mt-4 rounded-2xl border border-emerald-500/35 bg-emerald-500/8 p-5 text-sm">
        <p className="text-2xl">📨</p>
        <p className="mt-2 font-semibold text-white/85">Notice received.</p>
        <p className="mt-1 text-white/55">
          We&apos;ve emailed a copy to dmca@epicmusicspace.com. You&apos;ll hear back within 1–3 business
          days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="not-prose mt-4 space-y-4 rounded-2xl border border-white/10 bg-[#141420] p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">Full name</span>
          <input name="name" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">Email</span>
          <input name="email" type="email" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">Mailing address</span>
        <input name="address" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">Copyrighted work being infringed</span>
        <textarea
          name="work"
          required
          rows={2}
          maxLength={1000}
          placeholder="Title, ISRC, registration number, or description"
          className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">URL of allegedly infringing material on EMS</span>
        <input
          name="infringingUrl"
          type="url"
          required
          placeholder="https://epicmusicspace.com/track/…"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-white/75">
        <input name="goodFaith" type="checkbox" required className="mt-1" />
        <span>
          I have a good-faith belief that the use of the material is not authorized by the copyright owner,
          its agent, or the law.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-white/75">
        <input name="perjury" type="checkbox" required className="mt-1" />
        <span>
          Under penalty of perjury, I state the information in this notice is accurate and that I am the
          copyright owner or authorized to act on the owner&apos;s behalf.
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">Electronic signature (type your full name)</span>
        <input name="signature" required className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" />
      </label>
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit DMCA notice"}
      </button>
    </form>
  );
}
