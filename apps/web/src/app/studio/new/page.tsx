"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type UploadState = "idle" | "uploading" | "done" | "error";

export default function StudioNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [licensePrice, setLicensePrice] = useState("9.99");
  const [revenueSharePct, setRevenueSharePct] = useState("10");
  const [totalLicenses, setTotalLicenses] = useState("100");
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState("");

  // File state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const [audioUploadState, setAudioUploadState] = useState<UploadState>("idle");
  const [coverUploadState, setCoverUploadState] = useState<UploadState>("idle");
  const [submitState, setSubmitState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File, type: "audio" | "cover"): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    form.append("type", type);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json() as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.error ?? "Upload failed");
    }
    return data.url;
  }

  async function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioUploadState("uploading");
    setError(null);
    try {
      const url = await uploadFile(file, "audio");
      setAudioUrl(url);
      setAudioUploadState("done");
    } catch (err) {
      setAudioUploadState("error");
      setError(err instanceof Error ? err.message : "Audio upload failed");
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploadState("uploading");
    setError(null);
    try {
      const url = await uploadFile(file, "cover");
      setCoverUrl(url);
      setCoverUploadState("done");
    } catch (err) {
      // Cover upload failure is non-blocking — just clear the preview
      setCoverUploadState("error");
      setCoverPreview(null);
      setCoverFile(null);
      setError(err instanceof Error ? err.message : "Cover upload failed. You can proceed without a cover.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalAudioUrl = audioUrl.trim() || (audioRef.current?.value ?? "");
    const finalCoverUrl = coverUrl.trim() || "";

    if (!finalAudioUrl) {
      setError("Please upload an audio file or provide a direct audio URL.");
      return;
    }

    if (audioUploadState === "uploading" || coverUploadState === "uploading") {
      setError("Please wait for uploads to complete.");
      return;
    }

    setSubmitState("uploading");

    const payload = {
      title: title.trim(),
      artist: artistName.trim(),
      genre: genre.trim() || undefined,
      description: description.trim() || undefined,
      audioUrl: finalAudioUrl,
      coverUrl: finalCoverUrl || undefined,
      bpm: bpm ? Number(bpm) : undefined,
      key: key.trim() || undefined,
      licensePrice: Number(licensePrice),
      revenueSharePct: Number(revenueSharePct),
      totalLicenses: Number(totalLicenses),
    };

    const res = await fetch("/api/songs/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json() as { id?: string; error?: string };

    if (!res.ok || !data.id) {
      setSubmitState("error");
      setError(data.error ?? "Failed to create song. Please try again.");
      return;
    }

    setSubmitState("done");
    router.push(`/track/${data.id}`);
  }

  const uploading = audioUploadState === "uploading" || coverUploadState === "uploading";
  const submitting = submitState === "uploading";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gradient-ems">Upload Track</h1>
        <p className="mt-1 text-sm text-white/50">
          Publish your music to the EMS marketplace and start earning license royalties.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cover art */}
        <div className="glass-card rounded-2xl p-5">
          <label className="mb-3 block text-sm font-semibold text-white/70">
            Cover Art
          </label>
          <div className="flex items-start gap-5">
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:border-brand-500/60 transition"
            >
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="cover preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl">🎨</span>
              )}
              {coverUploadState === "uploading" && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                </div>
              )}
            </button>
            <div className="flex-1 text-sm text-white/40">
              <p>Click to upload a cover image (JPG, PNG, WebP — max 5MB)</p>
              {coverUploadState === "done" && (
                <p className="mt-1 text-green-400">✓ Cover uploaded</p>
              )}
              {coverUploadState === "error" && (
                <p className="mt-1 text-red-400">Upload failed — you can continue without a cover</p>
              )}
            </div>
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={handleCoverChange}
          />
        </div>

        {/* Audio file */}
        <div className="glass-card rounded-2xl p-5">
          <label className="mb-3 block text-sm font-semibold text-white/70">
            Audio File <span className="text-red-400">*</span>
          </label>
          <button
            type="button"
            onClick={() => audioRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-white/15 p-6 text-center hover:border-brand-500/60 transition"
          >
            {audioFile ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">🎵</span>
                <div className="text-left">
                  <p className="text-sm font-medium truncate max-w-xs">{audioFile.name}</p>
                  <p className="text-xs text-white/40">
                    {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                {audioUploadState === "uploading" && (
                  <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin ml-2" />
                )}
                {audioUploadState === "done" && (
                  <span className="text-green-400 ml-2">✓</span>
                )}
              </div>
            ) : (
              <div className="text-white/40">
                <p className="text-lg mb-1">🎵</p>
                <p className="text-sm">Click to upload audio file</p>
                <p className="text-xs mt-1">MP3, WAV, FLAC, AAC — max 50MB</p>
              </div>
            )}
          </button>
          <input
            ref={audioRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleAudioChange}
          />
          {/* Fallback: direct URL */}
          <div className="mt-3">
            <p className="text-xs text-white/30 mb-1">— or paste a direct audio URL —</p>
            <input
              type="url"
              placeholder="https://..."
              value={audioUrl}
              onChange={(e) => setAudioUrl(e.target.value)}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
            />
          </div>
        </div>

        {/* Track details */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white/70">Track Details</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Track title"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Artist Name <span className="text-red-400">*</span>
              </label>
              <input
                required
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Your artist name"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-white/50">Genre</label>
              <input
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                placeholder="Hip-Hop, Trap…"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">BPM</label>
              <input
                type="number"
                min="20"
                max="999"
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                placeholder="140"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">Key</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="C minor"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/50">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell listeners about this track…"
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60 resize-none"
            />
          </div>
        </div>

        {/* Licensing economics */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white/70">Licensing Economics</h2>
          <p className="text-xs text-white/30">
            Set your license price and how much revenue each license holder earns from future sales.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-white/50">
                License Price (USD) <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                <input
                  required
                  type="number"
                  min="0.50"
                  step="0.01"
                  value={licensePrice}
                  onChange={(e) => setLicensePrice(e.target.value)}
                  className="w-full rounded-lg bg-white/5 pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Revenue Share % <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={revenueSharePct}
                  onChange={(e) => setRevenueSharePct(e.target.value)}
                  className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60 pr-7"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">%</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Total Licenses <span className="text-red-400">*</span>
              </label>
              <input
                required
                type="number"
                min="1"
                max="10000"
                value={totalLicenses}
                onChange={(e) => setTotalLicenses(e.target.value)}
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
          </div>

          {/* Projected revenue */}
          <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-4">
            <p className="text-xs text-white/50">Projected max earnings (if all licenses sell)</p>
            <p className="text-xl font-bold text-brand-400 mt-1">
              ${(Number(licensePrice) * Number(totalLicenses)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-base font-bold text-white hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed glow-purple"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Publishing…
            </span>
          ) : uploading ? (
            "Uploading files…"
          ) : (
            "Publish to Marketplace ⚡"
          )}
        </button>

        <p className="text-center text-xs text-white/20">
          By publishing, you agree to the{" "}
          <a href="/legal/licensing" className="underline hover:text-white/50">
            EMS Licensing Agreement
          </a>
          .
        </p>
      </form>
    </div>
  );
}
