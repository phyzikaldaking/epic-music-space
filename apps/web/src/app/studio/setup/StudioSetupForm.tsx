"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { uploadImage, ClientUploadError } from "@/lib/clientImageUpload";

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

export default function StudioSetupForm({
  studio,
  nextPath = "/studio",
}: {
  studio: StudioData | null;
  nextPath?: string;
}) {
  const router = useRouter();

  const [username, setUsername] = useState(studio?.username ?? "");
  const [bio, setBio] = useState(studio?.bio ?? "");
  const [district, setDistrict] = useState<District>(studio?.district ?? "INDIE_BLOCKS");
  const [bannerUrl, setBannerUrl] = useState(studio?.bannerUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileRef = useRef<HTMLInputElement>(null);

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploadingBanner(true);
    try {
      // Shared `uploadImage` helper handles HEIC/HEIF, empty MIME from
      // iCloud picks, auto-resize for camera-sized originals, and PUT
      // retries — same pipeline track-cover and avatar uploads use.
      const result = await uploadImage(file, { kind: "cover" });
      setBannerUrl(result.publicUrl);
    } catch (err) {
      const msg =
        err instanceof ClientUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Banner upload failed. Try again or paste a direct URL below.";
      setError(msg);
    } finally {
      setUploadingBanner(false);
      if (bannerFileRef.current) bannerFileRef.current.value = "";
    }
  }

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

      router.push(nextPath);
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
            Banner Image <span className="text-white/30 font-normal">(optional)</span>
          </label>
          <p className="mb-3 text-xs text-white/35">
            Upload an image, or paste a direct image URL. JPG, PNG, WebP, HEIC — max 10 MB.
          </p>
          <input
            ref={bannerFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
            aria-label="Upload studio banner"
            className="sr-only"
            onChange={handleBannerFile}
          />
          <button
            type="button"
            onClick={() => bannerFileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand-500/50", "bg-brand-500/5"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand-500/50", "bg-brand-500/5"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-brand-500/50", "bg-brand-500/5");
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setError(null);
                setUploadingBanner(true);
                uploadImage(file, { kind: "cover" })
                  .then((result) => setBannerUrl(result.publicUrl))
                  .catch((err) => setError(err instanceof Error ? err.message : "Banner upload failed."))
                  .finally(() => setUploadingBanner(false));
              }
            }}
            disabled={uploadingBanner}
            className="mb-3 w-full rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] p-4 text-center transition hover:border-brand-500/40 disabled:opacity-50"
          >
            {uploadingBanner ? (
              <div className="flex items-center justify-center gap-2 text-sm text-white/60">
                <span className="h-4 w-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                Uploading…
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-sm text-white/50">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                {bannerUrl ? "Drop to replace, or click to browse" : "Drop banner here, or click to browse"}
              </div>
            )}
          </button>
          <input
            id="studio-banner"
            type="url"
            value={bannerUrl}
            onChange={(e) => setBannerUrl(e.target.value)}
            placeholder="https://images.unsplash.com/…"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
          />
          {bannerUrl && (
            <div className="relative mt-3 h-28 w-full overflow-hidden rounded-xl border border-white/10">
              <Image
                src={bannerUrl}
                alt="Banner preview"
                fill
                sizes="(max-width: 768px) 100vw, 672px"
                className="object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <button
                type="button"
                onClick={() => { setBannerUrl(""); }}
                className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-xs text-white/70 hover:bg-black/70 hover:text-white transition"
                aria-label="Remove banner"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
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
