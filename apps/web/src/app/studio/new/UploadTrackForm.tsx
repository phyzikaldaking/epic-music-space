"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import CompactAudioPlayer from "@/components/CompactAudioPlayer";
import EmbeddedAudioPreview from "@/components/EmbeddedAudioPreview";
import { classifyAudioSource } from "@/lib/audioSource";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import { validateUpload } from "@/lib/uploadValidation";
import { uploadImage, ClientUploadError } from "@/lib/clientImageUpload";
import { validateTrackSubmission } from "@/lib/trackPublishValidation";

type UploadState = "idle" | "uploading" | "done" | "error";

// `accept` strings include both MIME globs and explicit extensions because
// mobile Safari's "Files" picker often delivers cloud-stored audio with an
// empty MIME — without explicit extensions iOS hides those files entirely.
const AUDIO_ACCEPT =
  "audio/*,audio/mp4,audio/x-m4a,audio/aiff,.mp3,.wav,.flac,.aac,.m4a,.aif,.aiff,.ogg,.oga,.opus,.webm";
const COVER_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif";
const STEM_ACCEPT =
  ".zip,.wav,.mp3,.flac,.m4a,.aif,.aiff,audio/*,application/zip";

// File inputs use `sr-only` (Tailwind's screen-reader-only class) rather
// than `hidden` (display:none). Several mobile browsers — notably iOS
// Safari on older iOS, and certain Android Chrome accessibility configs
// — refuse to open the file picker for a `display:none` input when
// triggered programmatically; the click silently no-ops, the artist
// taps the upload button and "nothing happens." `sr-only` keeps the
// input rendered (size 1px, clipped, opacity 0) so the picker opens
// reliably. Don't change this back to `hidden`.
const HIDDEN_INPUT_CLASS = "sr-only";


function buzz(ms = 30) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    // Some browsers throw when not in a user gesture; safe to swallow.
  }
}

function fmtMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadTrackForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const legacyParam = searchParams.get("legacy") === "1";
  // Set by /vault/new so we know to return the artist to the vault
  // after a successful publish — they came from there, they should land
  // there (and see their tape sitting in the room they just left).
  const fromVault = searchParams.get("from") === "vault";

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [licensePrice, setLicensePrice] = useState("9.99");
  const [allowFreeDownload, setAllowFreeDownload] = useState(false);
  const [isLegacy, setIsLegacy] = useState(legacyParam);
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
  const [audioDuration, setAudioDuration] = useState<string | null>(null);
  const [coverDragActive, setCoverDragActive] = useState(false);

  const [audioUploadState, setAudioUploadState] = useState<UploadState>("idle");

  const [audioProgress, setAudioProgress] = useState(0);
  const [coverProgress, setCoverProgress] = useState(0);
  const [stemProgress, setStemProgress] = useState(0);

  const [coverUploadState, setCoverUploadState] = useState<UploadState>("idle");
  const [stemUploadState, setStemUploadState] = useState<UploadState>("idle");
  const [submitState, setSubmitState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  // XHR references for cancel support
  const audioXhrRef = useRef<XMLHttpRequest | null>(null);
  const stemXhrRef = useRef<XMLHttpRequest | null>(null);

  // True when audioUrl was set by *our* upload pipeline (vs a pasted URL).
  // Critical: when the artist just successfully uploaded, we MUST trust
  // that publicUrl unconditionally on submit. Re-running classifyAudioSource
  // on it has caused real "I uploaded, why is publish blocked?" failures
  // when Supabase URLs change shape (custom CDN domain, query params, etc.).
  // A pasted URL still gets the strict classify check.
  const [audioFromOurUpload, setAudioFromOurUpload] = useState(false);

  const audioRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const stemRef = useRef<HTMLInputElement>(null);
  const pageOpenedAtRef = useRef<number>(0);

  // Revoke any in-flight cover blob URL on unmount so we don't leak memory
  // if the user navigates away mid-upload.
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith("blob:")) {
        URL.revokeObjectURL(coverPreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadView,
      source: "studio_new",
    });
    pageOpenedAtRef.current = performance.now();
  }, []);

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
    xhrRef?: React.MutableRefObject<XMLHttpRequest | null>,
  ): Promise<void> => {
    // One retry with exponential backoff on transient failures (network
    // hiccup, transient 5xx). Fatal client errors (4xx) bail immediately.
    async function attempt(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        if (xhrRef) xhrRef.current = xhr;
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhrRef) xhrRef.current = null;
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
          if (xhrRef) xhrRef.current = null;
          const err = new Error("Network error during upload.");
          (err as Error & { retryable?: boolean }).retryable = true;
          reject(err);
        };
        xhr.onabort = () => {
          if (xhrRef) xhrRef.current = null;
          reject(new Error("Upload cancelled."));
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

  // Detect audio duration client-side using Web Audio API
  const detectAudioDuration = useCallback((file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          const mins = Math.floor(audio.duration / 60);
          const secs = Math.floor(audio.duration % 60);
          setAudioDuration(`${mins}:${secs.toString().padStart(2, "0")}`);
        }
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => URL.revokeObjectURL(url);
      audio.src = url;
    } catch {
      // Can't detect duration — not critical
    }
  }, []);
  const lastAudioFileRef = useRef<File | null>(null);

  const startAudioUpload = useCallback(async (file: File) => {
    lastAudioFileRef.current = file;
    const check = validateUpload("audio", file);
    if (!check.ok) {
      setAudioUploadState("error");
      setAudioFile(file);
      setError(check.reason);
      return;
    }
    const audioUploadStartedAt = performance.now();
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadAudioSelected,
      source: "studio_new",
      properties: {
        mimeType: file.type || "(empty)",
        fileSize: file.size,
        fileName: file.name,
      },
    });
    setAudioFile(file);
    setAudioUploadState("uploading");
    setAudioProgress(0);
    setAudioUrl("");
    setAudioFromOurUpload(false);
    setAudioDuration(null);
    setError(null);
    detectAudioDuration(file);
    try {
      const { signedUrl, publicUrl } = await getSignedUrl("audio", file);
      await uploadDirect(signedUrl, file, setAudioProgress, audioXhrRef);
      setAudioUrl(publicUrl);
      setAudioFromOurUpload(true);
      setAudioUploadState("done");
      buzz(40);
      void postFunnelEvent({
        event: FUNNEL_EVENTS.artistUploadAudioCompleted,
        source: "studio_new",
        properties: {
          durationMs: Math.round(performance.now() - audioUploadStartedAt),
          fileSize: file.size,
        },
      });
    } catch (err) {
      setAudioUploadState("error");
      setAudioProgress(0);
      setError(
        err instanceof Error
          ? `${err.message} Tap "Try again" — your file's still here.`
          : "Audio upload failed. Tap \"Try again\".",
      );
    }
  }, [getSignedUrl, uploadDirect, detectAudioDuration]);

  async function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await startAudioUpload(file);
  }

  async function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview((prev) => {
      // Revoke the previous blob URL so we don't leak memory across reuploads.
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setCoverUploadState("uploading");
    setCoverProgress(0);
    setError(null);
    try {
      // Bulletproof image pipeline: validates by MIME *or* extension
      // (iPhone HEIC + iCloud empty-MIME picks both pass), downscales
      // 12MP camera shots to 2048px on the long edge, re-encodes to
      // JPEG, and PUTs to Supabase with up to 2 retries on flaky
      // mobile networks.
      const result = await uploadImage(file, {
        kind: "cover",
        onProgress: (p) => {
          if (p.phase === "uploading" && typeof p.percent === "number") {
            setCoverProgress(p.percent);
          }
        },
      });
      setCoverUrl(result.publicUrl);
      setCoverUploadState("done");
      buzz(20);
    } catch (err) {
      setCoverUploadState("error");
      setCoverPreview((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setCoverFile(null);
      setCoverProgress(0);
      setError(
        err instanceof ClientUploadError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Cover upload failed. You can continue without a cover.",
      );
    }
  }

  async function handleStemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = validateUpload("stem", file);
    if (!check.ok) {
      setStemUploadState("error");
      setError(check.reason);
      return;
    }
    setStemFile(file);
    setStemUploadState("uploading");
    setStemProgress(0);
    setError(null);
    try {
      const { signedUrl, publicUrl } = await getSignedUrl("stem", file);
      await uploadDirect(signedUrl, file, setStemProgress, stemXhrRef);
      setStemUrl(publicUrl);
      setStemUploadState("done");
      buzz(20);
    } catch (err) {
      setStemUploadState("error");
      setStemProgress(0);
      setError(err instanceof Error ? err.message : "Stem upload failed");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadSubmitAttempt,
      source: "studio_new",
      properties: {
        hasAudioUrl: Boolean(audioUrl.trim()),
        hasCover: Boolean(coverUrl.trim() || coverPreview),
        hasStems: Boolean(stemUrl.trim()),
      },
    });

    if (audioUploadState === "uploading" || coverUploadState === "uploading" || stemUploadState === "uploading") {
      setError("Please wait for uploads to complete.");
      return;
    }

    // Single source of truth — every gating decision lives in
    // validateTrackSubmission, fully unit-tested. Adding a new gate?
    // Add it there, with a test, so "publish silently blocks" can't
    // regress in a refactor.
    const check = validateTrackSubmission({
      title,
      artistName,
      genre,
      description,
      audioUrl,
      audioFromOurUpload,
      coverUrl,
      stemUrl,
      bpm,
      key,
      licensePrice,
      revenueSharePct,
      totalLicenses,
      allowFreeDownload,
      isLegacy,
      originalReleaseYear,
    });
    if (!check.ok) {
      setError(check.reason);
      return;
    }

    setSubmitState("uploading");
    const payload = check.payload;

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
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadPublishCompleted,
      source: "studio_new",
      properties: {
        publishDurationMs: Math.round(performance.now() - pageOpenedAtRef.current),
        hasStems: Boolean(stemUrl.trim()),
        legacy: payload.isLegacy,
      },
    });

    // Return artists to the room they came from. Vault uploads land back
    // in the Vault so older artists see their tape sitting on the shelf;
    // everyone else goes to their studio. The catalog is cache-revalidated
    // server-side via the songs/homepage tags in /api/songs/create.
    if (payload.isLegacy && fromVault) {
      router.push("/vault");
    } else {
      router.push("/studio");
    }
  }

  const uploading = audioUploadState === "uploading" || coverUploadState === "uploading" || stemUploadState === "uploading";
  const submitting = submitState === "uploading";

  // Live "what's missing" hint. Renders below the submit button so
  // artists always know exactly what to fix — the submit button itself
  // is left enabled whenever there's *any* possible reason to click it,
  // so we never leave the user staring at a disabled button with no
  // explanation. If they click before the form is valid, handleSubmit
  // surfaces the same specific message inline.
  const blockingHint: string | null = (() => {
    if (submitting) return null;
    // `uploading` already covers audio/cover/stem === "uploading", so the
    // only remaining audio state worth calling out distinctly is "error".
    if (uploading) return "Files are still uploading. Hold tight.";
    if (!title.trim()) return "Add a track title to publish.";
    if (!artistName.trim()) return "Add your artist name.";
    if (!audioUrl.trim()) return "Upload an audio file (or paste an audio URL).";
    if (audioUploadState === "error")
      return "The audio upload failed — tap Try again, or paste a URL instead.";
    return null;
  })();

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gradient-ems">Upload Track</h1>
        <p className="mt-1 text-sm text-white/50">
          Publish your music to the EMS marketplace and start earning license royalties.
        </p>
        <div className="mt-5 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs font-bold uppercase tracking-[0.14em] text-white/55 sm:grid-cols-4">
          {([
            { label: "Upload audio", done: audioUploadState === "done" },
            { label: "Track details", done: Boolean(title.trim() && artistName.trim()) },
            { label: "Set licensing", done: Boolean(licensePrice && revenueSharePct && totalLicenses) },
            { label: "Publish", done: submitState === "done" },
          ]).map((step, index) => (
            <div
              key={step.label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                step.done
                  ? "border-green-500/25 bg-green-500/5"
                  : "border-white/10 bg-black/20"
              }`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] transition-colors ${
                step.done
                  ? "bg-green-500/25 text-green-400"
                  : "bg-brand-500/20 text-brand-200"
              }`}>
                {step.done ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className={step.done ? "text-green-400/80" : ""}>{step.label}</span>
            </div>
          ))}
        </div>
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
              onDragOver={(e) => { e.preventDefault(); setCoverDragActive(true); }}
              onDragLeave={() => setCoverDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setCoverDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  // Synthesize a change event through handleCoverChange-like logic
                  setCoverFile(file);
                  setCoverPreview((prev) => {
                    if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(file);
                  });
                  setCoverUploadState("uploading");
                  setCoverProgress(0);
                  setError(null);
                  uploadImage(file, {
                    kind: "cover",
                    onProgress: (p: { phase: string; percent?: number }) => {
                      if (p.phase === "uploading" && typeof p.percent === "number") setCoverProgress(p.percent);
                    },
                  }).then((result: { publicUrl: string }) => {
                    setCoverUrl(result.publicUrl);
                    setCoverUploadState("done");
                    buzz(20);
                  }).catch((err: unknown) => {
                    setCoverUploadState("error");
                    setCoverPreview((prev: string | null) => { if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev); return null; });
                    setCoverFile(null);
                    setCoverProgress(0);
                    setError(err instanceof Error ? err.message : "Cover upload failed.");
                  });
                }
              }}
              className={`relative h-32 w-32 flex-shrink-0 overflow-hidden rounded-2xl bg-white/5 border-2 border-dashed flex items-center justify-center transition ${
                coverDragActive ? "border-brand-500/60 bg-brand-500/5 scale-105" : coverPreview ? "border-white/20" : "border-white/10 hover:border-brand-500/40"
              }`}
            >
              {coverPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverPreview} alt="cover preview" className="h-full w-full object-cover rounded-xl" />
                  {coverUploadState === "done" && (
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl">
                      <span className="text-xs font-bold text-white">Replace</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-2">
                  <svg className="mx-auto h-8 w-8 text-white/20" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                  <p className="mt-1 text-[10px] text-white/25">Drop or tap</p>
                </div>
              )}
              {coverUploadState === "uploading" && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 rounded-xl">
                  <div className="h-6 w-6 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                  <span className="text-[10px] text-brand-400 font-bold">{coverProgress}%</span>
                </div>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/40">JPG, PNG, WebP, HEIC — max 10 MB. Square 1:1 recommended.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!title.trim()) {
                      setError("Add a track title first — the AI uses it to compose the cover.");
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
                      const bin = atob(data.imageBase64);
                      const buf = new Uint8Array(bin.length);
                      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
                      const file = new File([buf], `cover-${Date.now()}.png`, { type: "image/png" });
                      setCoverFile(file);
                      setCoverPreview((prev) => {
                        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                        return URL.createObjectURL(file);
                      });
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-300 transition hover:bg-brand-500/20 disabled:opacity-50"
                >
                  ✨ Generate with AI
                </button>
                {coverUploadState === "done" && (
                  <button
                    type="button"
                    onClick={() => coverRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50 transition hover:text-white hover:bg-white/10"
                  >
                    ↻ Replace
                  </button>
                )}
              </div>
              {coverUploadState === "done" && (
                <p className="mt-2 text-xs text-green-400 font-medium">✓ Cover uploaded</p>
              )}
              {coverUploadState === "error" && (
                <p className="mt-2 text-xs text-red-400">Upload failed — you can continue without a cover, or try again.</p>
              )}
              {coverUploadState === "uploading" && (
                <div className="mt-2">
                  <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-300"
                      style={{ width: `${coverProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          <input
            ref={coverRef}
            type="file"
            accept={COVER_ACCEPT}
            aria-label="Cover art image file"
            className={HIDDEN_INPUT_CLASS}
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
              if (!file) return;
              void startAudioUpload(file);
            }}
            className="w-full rounded-xl border-2 border-dashed border-white/15 p-6 text-center hover:border-brand-500/60 transition group"
          >
            {audioFile ? (
              <div className="flex items-center justify-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15">
                  <svg className="h-5 w-5 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" /></svg>
                </div>
                <div className="text-left min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{audioFile.name}</p>
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span>{fmtMB(audioFile.size)}</span>
                    {audioDuration && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">{audioDuration}</span>}
                    {audioFile.name.split(".").pop() && (
                      <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-300">
                        {audioFile.name.split(".").pop()?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                {audioUploadState === "uploading" && (
                  <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin ml-2 shrink-0" />
                )}
                {audioUploadState === "done" && (
                  <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 shrink-0">
                    <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-white/40">
                <svg className="mx-auto h-10 w-10 text-white/15 group-hover:text-brand-500/40 transition" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                <p className="hidden sm:block text-sm mt-2">Drop your audio file here, or click to browse</p>
                <p className="block sm:hidden text-sm mt-2">Tap to add from Files, iCloud, or your music library</p>
                <p className="text-xs mt-1 text-white/25">MP3, WAV, FLAC, AAC, M4A, OGG — up to 200 MB</p>
              </div>
            )}
          </button>
          <input
            ref={audioRef}
            type="file"
            accept={AUDIO_ACCEPT}
            aria-label="Audio track file"
            className={HIDDEN_INPUT_CLASS}
            onChange={handleAudioChange}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {audioUploadState === "error" && lastAudioFileRef.current && (
              <button
                type="button"
                onClick={() => {
                  const f = lastAudioFileRef.current;
                  if (f) void startAudioUpload(f);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-300 hover:bg-brand-500/20"
              >
                ↻ Try again
              </button>
            )}
            {audioUploadState === "uploading" && (
              <button
                type="button"
                onClick={() => {
                  audioXhrRef.current?.abort();
                  setAudioUploadState("idle");
                  setAudioProgress(0);
                  setAudioFile(null);
                  setAudioDuration(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition"
              >
                Cancel
              </button>
            )}
            {audioUploadState === "done" && (
              <button
                type="button"
                onClick={() => audioRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                ↻ Replace file
              </button>
            )}
          </div>
          <div className="mt-3">
            {/* Upload progress bar */}
            {audioUploadState === "uploading" && (
              <div className="mb-3">
                <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-300"
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-brand-400 font-medium">Uploading… {audioProgress}%</p>
              </div>
            )}

            {/* Audio preview — render the right kind of player for the URL.
                Direct stream → <CompactAudioPlayer>. Embed (YouTube /
                Vimeo / SoundCloud / Spotify) → <EmbeddedAudioPreview>.
                Unknown URL → graceful "preview unavailable" card. */}
            {audioUploadState === "done" && audioUrl && (() => {
              const src = classifyAudioSource(audioUrl);
              return (
                <div className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="mb-2 text-xs font-semibold text-green-400">
                    ✓ {src.type === "stream" ? "Upload complete — preview your track:" : `Detected ${src.label ?? "external"} — preview only:`}
                  </p>
                  {src.type === "stream" ? (
                    <CompactAudioPlayer src={audioUrl} label="Preview" />
                  ) : (
                    <EmbeddedAudioPreview audioUrl={audioUrl} title={title || "Preview"} />
                  )}
                  {src.warning && src.type !== "stream" && (
                    <p className="mt-2 text-[11px] text-yellow-300/85">
                      ⚠️ {src.warning}
                    </p>
                  )}
                </div>
              );
            })()}

            <p className="text-xs text-white/30 mb-1">— or paste an audio URL (direct file, YouTube, Vimeo, SoundCloud, Spotify) —</p>
            <input
              type="url"
              placeholder="https://..."
              value={audioUrl}
              onChange={(e) => {
                const v = e.target.value;
                setAudioUrl(v);
                // Pasted URLs go through strict classification — uploaded
                // URLs from our own pipeline are trusted unconditionally.
                setAudioFromOurUpload(false);
                // Only mark "done" once the pasted URL classifies as a known
                // stream or embed source. Unknown URLs stay in idle so the
                // submit button keeps the user honest.
                if (!v) {
                  if (audioUploadState === "done") setAudioUploadState("idle");
                  return;
                }
                const cls = classifyAudioSource(v);
                if (cls.type !== "unknown") {
                  setAudioUploadState("done");
                } else if (audioUploadState === "done") {
                  setAudioUploadState("idle");
                }
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
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-brand-500/60", "bg-brand-500/5"); }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5"); }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5");
              const file = e.dataTransfer.files?.[0];
              if (file) {
                // Mirror handleStemChange
                const check = validateUpload("stem", file);
                if (!check.ok) { setStemUploadState("error"); setError(check.reason); return; }
                setStemFile(file); setStemUploadState("uploading"); setStemProgress(0); setError(null);
                getSignedUrl("stem", file).then(({ signedUrl, publicUrl }) =>
                  uploadDirect(signedUrl, file, setStemProgress, stemXhrRef).then(() => {
                    setStemUrl(publicUrl); setStemUploadState("done"); buzz(20);
                  })
                ).catch((err) => { setStemUploadState("error"); setStemProgress(0); setError(err instanceof Error ? err.message : "Stem upload failed"); });
              }
            }}
            className="w-full rounded-xl border-2 border-dashed border-white/15 p-5 text-center hover:border-brand-500/60 transition group"
          >
            {stemFile ? (
              <div className="flex items-center justify-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/15">
                  <svg className="h-5 w-5 text-accent-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                </div>
                <div className="text-left min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{stemFile.name}</p>
                  <p className="text-xs text-white/40">{fmtMB(stemFile.size)}</p>
                </div>
                {stemUploadState === "uploading" && (
                  <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin ml-2 shrink-0" />
                )}
                {stemUploadState === "done" && (
                  <div className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 shrink-0">
                    <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  </div>
                )}
                {stemUploadState === "error" && <span className="text-red-400 text-xs font-bold ml-2 shrink-0">Failed</span>}
              </div>
            ) : (
              <div className="text-white/40">
                <svg className="mx-auto h-8 w-8 text-white/15 group-hover:text-accent-500/40 transition" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                <p className="text-sm mt-2">Drop stems here, or click to browse</p>
                <p className="text-xs mt-1 text-white/25">ZIP, WAV, MP3, FLAC — max 500 MB</p>
              </div>
            )}
          </button>
          <input
            ref={stemRef}
            type="file"
            accept={STEM_ACCEPT}
            aria-label="Trackout or stems file"
            className={HIDDEN_INPUT_CLASS}
            onChange={handleStemChange}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {stemUploadState === "uploading" && (
              <button
                type="button"
                onClick={() => {
                  stemXhrRef.current?.abort();
                  setStemUploadState("idle");
                  setStemProgress(0);
                  setStemFile(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition"
              >
                Cancel
              </button>
            )}
            {stemUploadState === "done" && (
              <button
                type="button"
                onClick={() => stemRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/50 hover:text-white hover:bg-white/10 transition"
              >
                ↻ Replace
              </button>
            )}
          </div>
          {stemUploadState === "uploading" && (
            <div className="mt-2">
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-300"
                  style={{ width: `${stemProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-brand-400 font-medium">Uploading… {stemProgress}%</p>
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

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-amber-500/4 to-transparent p-4 shadow-[0_10px_30px_-15px_rgba(245,158,11,0.45)]">
            <input
              type="checkbox"
              checked={isLegacy}
              onChange={(e) => setIsLegacy(e.target.checked)}
              className="mt-1 h-4 w-4 cursor-pointer accent-amber-500"
            />
            <span className="flex-1">
              <span className="flex items-center gap-2">
                <span className="text-base" aria-hidden>📼</span>
                <span className="block text-sm font-semibold text-amber-200">
                  This belongs in The Vault
                </span>
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-amber-100/70">
                Tag this track as legacy and it joins your studio&apos;s Vault
                section <em>and</em> the public{" "}
                <a href="/vault" target="_blank" rel="noopener" className="text-amber-200 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-100">
                  /vault
                </a>{" "}
                — a dedicated home for older releases, archived demos, and
                back-when-I-used-to-rap material. The original year shows on
                every record. Excluded from Trending so new releases stay
                current; fully streamable and licensable.
              </span>
              {isLegacy && (
                <span className="mt-3 block">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-amber-200/80 mb-1">
                    Original release year
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={originalReleaseYear}
                    onChange={(e) => setOriginalReleaseYear(e.target.value)}
                    placeholder="e.g. 2003"
                    className="w-32 rounded-lg border border-amber-500/25 bg-black/30 px-3 py-1.5 text-sm text-amber-100 placeholder-amber-100/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
                  />
                  <span className="mt-1.5 block text-[10px] text-amber-100/55">
                    Shown as a stamp on every vault record. Optional but heavily recommended.
                  </span>
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
          // Only ever disabled while we're *actively doing work* (a PUT in
          // flight or the create call is mid-air). We never leave the
          // button disabled for "form not valid" reasons — handleSubmit
          // surfaces a specific inline error instead. An always-clickable
          // submit is the cure for "I'm filling everything in and the
          // button just doesn't work."
          disabled={submitting || uploading}
          aria-describedby={blockingHint ? "publish-hint" : undefined}
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
        {blockingHint && (
          <p
            id="publish-hint"
            className="-mt-2 text-center text-xs text-amber-300/85"
            role="status"
            aria-live="polite"
          >
            ⚠ {blockingHint}
          </p>
        )}

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
