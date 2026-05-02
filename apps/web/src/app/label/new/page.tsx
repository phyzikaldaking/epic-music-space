"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewLabelPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    bio: "",
    logoUrl: "",
    revSharePct: "10",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug from name
      if (field === "name") {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 50);
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const revSharePct = parseFloat(form.revSharePct);
    if (isNaN(revSharePct) || revSharePct < 1 || revSharePct > 50) {
      setError("Revenue share must be between 1% and 50%.");
      setLoading(false);
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      revSharePct,
    };
    if (form.bio.trim()) body.bio = form.bio.trim();
    if (form.logoUrl.trim()) body.logoUrl = form.logoUrl.trim();

    const res = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        router.push("/auth/signin?callbackUrl=/label/new");
        return;
      }
      setError(data.error ?? "Failed to create label.");
      setLoading(false);
      return;
    }

    router.push(`/label/${data.id}`);
  }

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-gold-500/10 blur-[120px]" />

      <div className="relative w-full max-w-lg">
        <div className="glass-card rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/label"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition"
            >
              ← Back to Labels
            </Link>
            <h1 className="text-3xl font-extrabold">
              Start a <span className="text-gradient-gold">Label</span>
            </h1>
            <p className="mt-2 text-sm text-white/45">
              Create your music label, sign artists, and earn from their licensing activity.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/15 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Label Name */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Label Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/40"
                placeholder="e.g. Neon Empire Records"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                URL Slug <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/4 focus-within:border-gold-500/60 focus-within:ring-1 focus-within:ring-gold-500/40 transition overflow-hidden">
                <span className="px-3 text-sm text-white/25 border-r border-white/8 py-3 bg-white/3">
                  /label/
                </span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  pattern="[a-z0-9-]+"
                  value={form.slug}
                  onChange={(e) => update("slug", e.target.value)}
                  className="flex-1 bg-transparent px-3 py-3 text-sm text-white placeholder-white/25 focus:outline-none"
                  placeholder="neon-empire"
                />
              </div>
              <p className="mt-1 text-xs text-white/25">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>

            {/* Bio */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Bio
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={form.bio}
                onChange={(e) => update("bio", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/40 resize-none"
                placeholder="Tell artists and fans what your label is about…"
              />
            </div>

            {/* Logo URL */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Logo URL
              </label>
              <input
                type="url"
                value={form.logoUrl}
                onChange={(e) => update("logoUrl", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/40"
                placeholder="https://example.com/logo.png"
              />
            </div>

            {/* Revenue Share */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Artist Revenue Share % <span className="text-red-400">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  required
                  min={1}
                  max={50}
                  step={0.5}
                  value={form.revSharePct}
                  onChange={(e) => update("revSharePct", e.target.value)}
                  className="w-28 rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-gold-500/60 focus:outline-none focus:ring-1 focus:ring-gold-500/40"
                />
                <p className="text-sm text-white/40">
                  % of licensing revenue shared with signed artists
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 py-3 font-bold text-[#0a0a0a] transition hover:opacity-90 disabled:opacity-50 glow-gold"
            >
              {loading ? "Creating label…" : "Create Label 👑"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/20">
            You can only own one label per account. By creating a label you agree to
            our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/45">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
