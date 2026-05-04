"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type District = "INDIE_BLOCKS" | "DOWNTOWN_PRIME" | "LABEL_ROW";

interface StudioData {
  username: string;
  bio: string | null;
  district: District;
  bannerUrl: string | null;
}

const DISTRICTS: { value: District; label: string; icon: string; desc: string }[] = [
  { value: "INDIE_BLOCKS", label: "Indie Blocks", icon: "🎸", desc: "Independent artists, bedroom producers, DIY scene." },
  { value: "DOWNTOWN_PRIME", label: "Downtown Prime", icon: "🏙️", desc: "Rising stars with high-traffic exposure and real momentum." },
  { value: "LABEL_ROW", label: "Label Row", icon: "🏢", desc: "Label-backed artists and working professionals." },
];

export default function StudioSetupForm({ studio }: { studio: StudioData | null }) {
  const router = useRouter();

  const [username, setUsername] = useState(studio?.username ?? "");
  const [bio, setBio] = useState(studio?.bio ?? "");
  const [district, setDistrict] = useState<District>(studio?.district ?? "INDIE_BLOCKS");
  const [bannerUrl, setBannerUrl] = useState(studio?.bannerUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/studio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          bio: bio.trim() || undefined,
          bannerUrl: bannerUrl.trim() || undefined,
          district,
        }),
      });

      const data = (await res.json()) as { username?: string; error?: string };

      if (!res.ok) {
        setError(data.error ?? "Failed to save studio profile.");
        return;
      }

      router.push(`/studio/${data.username}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-brand-400">
          Step 1 of 1
        </p>
        <h1 className="text-3xl font-extrabold text-gradient-ems">Set Up Your Studio</h1>
        <p className="mt-2 text-sm text-white/50">
          Complete your artist profile so fans can discover your music on Epic Music Space.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Username */}
        <div className="glass-card rounded-2xl p-5">
          <label htmlFor="studio-username" className="mb-1 block text-sm font-semibold text-white/70">
            Studio Username <span className="text-red-400">*</span>
          </label>
          <p className="mb-3 text-xs text-white/35">
            Your public URL: epicmusicspace.com/studio/
            <span className="font-mono text-brand-400">{username || "your-name"}</span>
          </p>
          <input
            id="studio-username"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            title="Letters, numbers, hyphens, and underscores only"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-artist-name"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
          />
        </div>

        {/* District */}
        <div className="glass-card rounded-2xl p-5">
          <p className="mb-3 text-sm font-semibold text-white/70">District</p>
          <p className="mb-4 text-xs text-white/35">
            Districts group artists by their scene. Choose the one that fits your vibe.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {DISTRICTS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDistrict(d.value)}
                className={`rounded-xl border p-4 text-left transition ${
                  district === d.value
                    ? "border-brand-500/60 bg-brand-500/15"
                    : "border-white/10 bg-white/3 hover:border-white/25 hover:bg-white/5"
                }`}
              >
                <div className="mb-2 text-2xl">{d.icon}</div>
                <p className="font-semibold text-sm">{d.label}</p>
                <p className="mt-1 text-xs text-white/45">{d.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div className="glass-card rounded-2xl p-5">
          <label htmlFor="studio-bio" className="mb-1 block text-sm font-semibold text-white/70">
            Bio
          </label>
          <textarea
            id="studio-bio"
            rows={4}
            maxLength={500}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell the world about your sound, your influences, your story…"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60 resize-none"
          />
          <p className="mt-1 text-right text-xs text-white/30">{bio.length}/500</p>
        </div>

        {/* Banner */}
        <div className="glass-card rounded-2xl p-5">
          <label htmlFor="studio-banner" className="mb-1 block text-sm font-semibold text-white/70">
            Banner Image URL <span className="text-white/30 font-normal">(optional)</span>
          </label>
          <input
            id="studio-banner"
            type="url"
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
            placeholder="https://images.unsplash.com/…"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
          />
          {bannerUrl && (
            <div className="mt-3 h-24 w-full overflow-hidden rounded-xl border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50 transition glow-purple-sm"
          >
            {saving ? "Saving…" : "Save Studio Profile →"}
          </button>
          <Link
            href="/studio"
            className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/60 hover:bg-white/8 transition"
          >
            Skip
          </Link>
        </div>
      </form>
    </div>
  );
}
