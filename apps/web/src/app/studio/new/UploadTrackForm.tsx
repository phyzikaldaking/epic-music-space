"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CompactAudioPlayer from "@/components/CompactAudioPlayer";

type UploadState = "idle" | "uploading" | "done" | "error";

export default function UploadTrackForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [licensePrice, setLicensePrice] = useState("9.99");
  const [allowFreeDownload, setAllowFreeDownload] = useState(false);
  const [isLegacy, setIsLegacy] = useState(false);
  const [originalReleaseYear, setOriginalReleaseYear] = useState("");
  const [revenueSharePct, setRevenueSharePct] = useState("10");
  const [totalLicenses, setTotalLicenses] = useState("100");
  const [bpm, setBpm] = useState("");
  const [key, setKey] = useState("");

  const [audioFile, setAudioFile] = useState<File | null>(null);
  // _coverFile stored only to allow clearing on error via setCoverFile(null)
  const [_coverFile, setCoverFile] = useState<File | null>(null);
  const [stemFile, setStemFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [stemUrl, setStemUrl] = useState("");

  const [audioUploadState, setAudioUploadState] = useState<UploadState>("idle");

    const [audioProgress, setAudioProgress] = useState(0);
    const [coverProgress, setCoverProgress] = useState(0);
    const [stemProgress, setStemProgress] = useState(0);

  const [coverUploadState, setCoverUploadState] = useState<UploadState>("idle");
  const [stemUploadState, setStemUploadState] = useState<UploadState>("idle");
  const [submitState, setSubmitState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const stemRef = useRef<HTMLInputElement>(null);

  // ── Upload helpers ─────────────────────────────────────────────────────────
  // 1. Ask the API for a Supabase signed upload URL (tiny JSON request).
  // 2. PUT the file bytes directly from the browser to Supabase Storage.
  //    This bypasses Vercel's 4.5 MB body limit entirely.
  const getSignedUrl = useCallback(async (
    type: "audio" | "cover" | "stem",
    file: File,
  ): Promise<{ signedUrl: string; publicUrl: string }> => {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, fileName: file.name, mimeType: file.type, fileSize: file.size }),
    });
    const data = await res.json() as { signedUrl?: string; publicUrl?: string; error?: string };
    if (!res.ok || !data.signedUrl || !data.publicUrl) {
      throw new Error(data.error ?? "Could not start upload. Please try again.");
    }
    return { signedUrl: data.signedUrl, publicUrl: data.publicUrl };
  }, []);

  const uploadDirect = useCallback(async (
    signedUrl: string,
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<void> => {
    // One retry with exponential backoff on transient failures (network
    // hiccup, transient 5xx). Fatal client errors (4xx) bail immediately.
    async function attempt(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress(100);
            resolve();
          } else if (xhr.status >= 500 || xhr.status === 0) {
            const err = new Error(`Upload failed (${xhr.status}).`);
            (err as Error & { retryable?: boolean }).retryable = true;
            reject(err);
          } else {
            reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
          }
        };
        xhr.onerror = () => {
          const err = new Error("Network error during upload.");
          (err as Error & { retryable?: boolean }).retryable = true;
          reject(err);
        };
        xhr.send(file);
      });
    }

    try {
      await attempt();
    } catch (err) {
      if (!(err as { retryable?: boolean }).retryable) throw err;
      // Wait 1s with 30% jitter, then retry once.
      const delay = 1_000 + Math.random() * 300;
      await new Promise((r) => setTimeout(r, delay));
      onProgress(0);
      await attempt();
    }
  }, []);
  async function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioUploadState("uploading");
    setAudioProgress(0);
    setAudioUrl("");
    setError(null);
    try {
      const { signedUrl, publicUrl } = await getSignedUrl("audio", file);
      await uploadDirect(signedUrl, file, setAudioProgress);
      setAudioUrl(publicUrl);
      setAudioUploadState("done");
    } catch (err) {
      setAudioUploadState("error");
      setAudioProgress(0);
      setError(err instanceof Error ? err.message : "Audio upload failed");
    }
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploadState("uploading");
    setCoverProgress(0);
    setError(null);
    try {
      const { signedUrl, publicUrl } = await getSignedUrl("cover", file);
      await uploadDirect(signedUrl, file, setCoverProgress);
      setCoverUrl(publicUrl);
      setCoverUploadState("done");
    } catch (err) {
      setCoverUploadState("error");
      setCoverPreview(null);
      setCoverFile(null);
      setCoverProgress(0);
      setError(err instanceof Error ? err.message : "Cover upload failed. You can continue without a cover.");
    }
  }

  async function handleStemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStemFile(file);
    setStemUploadState("uploading");
    setStemProgress(0);
    setError(null);
    try {
      const { signedUrl, publicUrl } = await getSignedUrl("stem", file);
      await uploadDirect(signedUrl, file, setStemProgress);
      setStemUrl(publicUrl);
      setStemUploadState("done");
    } catch (err) {
      setStemUploadState("error");
      setStemProgress(0);
      setError(err instanceof Error ? err.message : "Stem upload failed");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalAudioUrl = audioUrl.trim();
    const finalCoverUrl = coverUrl.trim() || "";

    if (!finalAudioUrl) {
      setError("Please upload an audio file or provide a direct audio URL.");
      return;
    }

    if (audioUploadState === "uploading" || coverUploadState === "uploading" || stemUploadState === "uploading") {
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
      stemUrl: stemUrl.trim() || undefined,
      hasStems: !!stemUrl.trim(),
      allowFreeDownload,
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
      if (res.status === 401) {
        router.push("/auth/signin?callbackUrl=/studio/new");
        return;
      }
      setError(data.error ?? "Failed to create song. Please try again.");
      return;
    }

    setSubmitState("done");
    router.push("/studio");
  }

  const uploading = audioUploadState === "uploading" || coverUploadState === "uploading" || stemUploadState === "uploading";
  const submitting = submitState === "uploading";

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gradient-ems">Upload Track</h1>
        <p className="mt-1 text-sm text-white/50">
          Publish your music to the EMS marketplace and start earning license royalties.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                // Local blob preview — next/image can't optimize blob: URLs
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
              <button
                type="button"
                onClick={async () => {
                  if (!title.trim()) {
                    alert("Add a track title first — the AI uses it to compose the cover.");
                    return;
                  }
                  setCoverUploadState("uploading");
                  setCoverProgress(0);
                  try {
                    const res = await fetch("/api/cover/generate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: title.trim(), genre: genre.trim() || undefined }),
                    });
                    const data = (await res.json()) as { imageBase64?: string; error?: string };
                    if (!res.ok || !data.imageBase64) {
                      throw new Error(data.error ?? "Cover generation failed.");
                    }
                    // Convert base64 to a File and run through the existing upload pipeline.
                    const bin = atob(data.imageBase64);
                    const buf = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                    const file = new File([buf], `cover-${Date.now()}.png`, { type: "image/png" });
                    setCoverFile(file);
                    setCoverPreview(URL.createObjectURL(file));
                    const { signedUrl, publicUrl } = await getSignedUrl("cover", file);
                    await uploadDirect(signedUrl, file, setCoverProgress);
                    setCoverUrl(publicUrl);
                    setCoverUploadState("done");
                  } catch (err) {
                    setCoverUploadState("error");
                    setError(err instanceof Error ? err.message : "Cover generation failed.");
                  }
                }}
                disabled={coverUploadState === "uploading"}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-300 transition hover:bg-brand-500/20 disabled:opacity-50"
              >
                ✨ Generate cover with AI
              </button>
              {coverUploadState === "done" && (
                <p className="mt-1 text-green-400">✓ Cover uploaded</p>
              )}
              {coverUploadState === "error" && (
                <p className="mt-1 text-red-400">Upload failed — you can continue without a cover</p>
              )}
              {coverUploadState === "uploading" && (
                <div className="mt-2">
                  <div className="h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-brand-400 transition-all duration-200"
                      style={{ width: `${coverProgress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-brand-400">{coverProgress}%</p>
                </div>
              )}
            </div>
          </div>
          <input
            ref={coverRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            aria-label="Cover art image file"
            className="hidden"
            onChange={handleCoverChange}
          />
        </div>

        <div className="glass-card rounded-2xl p-5">
          <label className="mb-3 block text-sm font-semibold text-white/70">
            Audio File <span className="text-red-400">*</span>
          </label>
          <button
            type="button"
            onClick={() => audioRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-brand-500/60", "bg-brand-500/5");
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5");
              const file = e.dataTransfer.files?.[0];
              if (!file || !audioRef.current) return;
              if (!file.type.startsWith("audio/")) {
                alert("Please drop an audio file (MP3, WAV, FLAC, AAC).");
                return;
              }
              const dt = new DataTransfer();
              dt.items.add(file);
              audioRef.current.files = dt.files;
              audioRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }}
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
                <p className="text-sm">Drop your audio file here, or click to browse</p>
                <p className="text-xs mt-1">MP3, WAV, FLAC, AAC — max 200MB</p>
              </div>
            )}
          </button>
          <input
            ref={audioRef}
            type="file"
            accept="audio/*"
            aria-label="Audio track file"
            className="hidden"
            onChange={handleAudioChange}
          />
          <div className="mt-3">
            {/* Upload progress bar */}
            {audioUploadState === "uploading" && (
              <div className="mb-3">
                <div className="h-1.5 w-full rounded-full bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-brand-400 transition-all duration-200"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-brand-400">Uploading… {audioProgress}%</p>
              </div>
            )}

            {/* Audio preview player — shows once upload is done or URL is pasted */}
            {audioUploadState === "done" && audioUrl && (
              <div className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="mb-2 text-xs font-semibold text-green-400">✓ Upload complete — preview your track:</p>
                <CompactAudioPlayer src={audioUrl} label="Preview" />
              </div>
            )}

            <p className="text-xs text-white/30 mb-1">— or paste a direct audio URL —</p>
            <input
              type="url"
              placeholder="https://..."
              value={audioUrl}
              onChange={(e) => {
                setAudioUrl(e.target.value);
                // Reset upload state when user manually pastes a URL
                if (e.target.value && audioUploadState === "idle") setAudioUploadState("done");
              }}
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
            />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-semibold text-white/70">
              Trackout / Stems{" "}
              <span className="ml-1 rounded-full bg-brand-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-400">
                Instant Download
              </span>
            </label>
          </div>
          <p className="mb-4 text-xs text-white/35">
            Upload a ZIP with all stems or a single trackout WAV/MP3. Buyers receive a download link instantly after purchase.
          </p>
          <button
            type="button"
            onClick={() => stemRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-white/15 p-5 text-center hover:border-brand-500/60 transition"
          >
            {stemFile ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">📦</span>
                <div className="text-left">
                  <p className="text-sm font-medium truncate max-w-xs">{stemFile.name}</p>
                  <p className="text-xs text-white/40">
                    {(stemFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                {stemUploadState === "uploading" && (
                  <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin ml-2" />
                )}
                {stemUploadState === "done" && <span className="text-green-400 ml-2">✓ Uploaded</span>}
                {stemUploadState === "error" && <span className="text-red-400 ml-2">✗ Failed</span>}
              </div>
            ) : (
              <div className="text-white/40">
                <p className="text-lg mb-1">📦</p>
                <p className="text-sm">Click to upload trackout / stems</p>
                <p className="text-xs mt-1">ZIP, WAV, MP3, FLAC — max 500MB · Optional</p>
              </div>
            )}
          </button>
          <input
            ref={stemRef}
            type="file"
            accept=".zip,.wav,.mp3,.flac,audio/*,application/zip"
            aria-label="Trackout or stems file"
            className="hidden"
            onChange={handleStemChange}
          />
          {stemUploadState === "uploading" && (
            <div className="mt-3">
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-brand-400 transition-all duration-200"
                  style={{ width: `${stemProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-brand-400">Uploading… {stemProgress}%</p>
            </div>
          )}
        </div>

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
                  aria-label="License price in USD"
                  placeholder="9.99"
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
                  aria-label="Revenue share percentage"
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
                aria-label="Total number of licenses"
                placeholder="100"
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 border border-white/10 focus:outline-none focus:border-brand-500/60"
              />
            </div>
          </div>

          <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-4">
            <p className="text-xs text-white/50">Projected max earnings (if all licenses sell)</p>
            <p className="text-xl font-bold text-brand-400 mt-1">
              ${(Number(licensePrice) * Number(totalLicenses)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/3 p-4">
            <input
              type="checkbox"
              checked={allowFreeDownload}
              onChange={(e) => setAllowFreeDownload(e.target.checked)}
              className="mt-1 h-4 w-4 cursor-pointer accent-brand-500"
            />
            <span className="flex-1">
              <span className="block text-sm font-semibold">
                Allow free download of the audio file
              </span>
              <span className="mt-1 block text-xs text-white/50">
                Off by default. When off, listeners can preview the track but
                cannot download the audio file. Buying a license unlocks the
                download regardless of this toggle. Turn ON only if you want
                this track freely downloadable for promotion.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/4 p-4">
            <input
              type="checkbox"
              checked={isLegacy}
              onChange={(e) => setIsLegacy(e.target.checked)}
              className="mt-1 h-4 w-4 cursor-pointer accent-amber-500"
            />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-amber-200">
                Legacy / vault track
              </span>
              <span className="mt-1 block text-xs text-white/55">
                For older catalog material — songs you released years ago,
                back-when-I-used-to-rap material, archived demos. Legacy
                tracks land in a separate &ldquo;Vault&rdquo; section on your
                studio page and are excluded from Trending and the
                Marketplace home so new releases stay current. Listeners can
                still find, stream, and license them.
              </span>
              {isLegacy && (
                <span className="mt-3 block">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-amber-200/70 mb-1">
                    Original release year (optional)
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={originalReleaseYear}
                    onChange={(e) => setOriginalReleaseYear(e.target.value)}
                    placeholder="e.g. 2003"
                    className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm placeholder-white/25"
                  />
                </span>
              )}
            </span>
          </label>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

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
          <Link href="/legal/licensing" className="underline hover:text-white/50">
            EMS Licensing Agreement
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
