"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 50);
}

export default function NewLabelPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [bio, setBio] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [revSharePct, setRevSharePct] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(val: string) {
    setName(val);
    if (!slugManual) setSlug(toSlug(val));
  }

  function handleSlugChange(val: string) {
    setSlugManual(true);
    setSlug(toSlug(val));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          bio: bio || undefined,
          logoUrl: logoUrl || undefined,
          revSharePct,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      router.push(`/label/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-10">
        <a
          href="/label"
          className="text-sm text-white/40 hover:text-white/70 transition mb-4 inline-block"
        >
          ← Back to Labels
        </a>
        <h1 className="text-4xl font-extrabold text-gradient-ems">Create a Label</h1>
        <p className="mt-2 text-white/50">
          Build your roster, sign artists, and earn a revenue share from every license they sell.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass-card rounded-2xl border border-brand-500/30 p-8 space-y-6"
      >
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-white/70 mb-1">
            Label Name <span className="text-brand-400">*</span>
          </label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Midnight Collective"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-semibold text-white/70 mb-1">
            Slug <span className="text-brand-400">*</span>
          </label>
          <div className="flex items-center rounded-xl bg-white/5 border border-white/10 overflow-hidden focus-within:border-brand-500 transition">
            <span className="px-3 text-white/30 text-sm select-none">ems.io/label/</span>
            <input
              type="text"
              required
              minLength={2}
              maxLength={50}
              pattern="[a-z0-9-]+"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="midnight-collective"
              className="flex-1 bg-transparent px-2 py-3 text-white placeholder-white/30 focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-white/30">Only lowercase letters, numbers, and hyphens.</p>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-semibold text-white/70 mb-1">
            Bio <span className="text-white/30 font-normal">(optional)</span>
          </label>
          <textarea
            maxLength={1000}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="Tell artists and listeners what your label is about…"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition resize-none"
          />
          <p className="mt-1 text-xs text-white/30 text-right">{bio.length}/1000</p>
        </div>

        {/* Logo URL */}
        <div>
          <label className="block text-sm font-semibold text-white/70 mb-1">
            Logo URL <span className="text-white/30 font-normal">(optional)</span>
          </label>
          <input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-brand-500 transition"
          />
        </div>

        {/* Revenue Share */}
        <div>
          <label className="block text-sm font-semibold text-white/70 mb-2">
            Artist Revenue Share:{" "}
            <span className="text-brand-400 font-bold">{100 - revSharePct}%</span> to artist,{" "}
            <span className="text-gold font-bold">{revSharePct}%</span> to label
          </label>
          <input
            type="range"
            min={1}
            max={50}
            value={revSharePct}
            onChange={(e) => setRevSharePct(Number(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>1% label cut</span>
            <span>50% label cut</span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            EMS takes 10% platform fee. The remaining {100 - revSharePct - 10}% goes to the artist.
          </p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !name || !slug}
          className="w-full rounded-xl bg-brand-500 py-3 font-bold text-white hover:bg-brand-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Creating…" : "Create Label"}
        </button>
      </form>
    </div>
  );
}
