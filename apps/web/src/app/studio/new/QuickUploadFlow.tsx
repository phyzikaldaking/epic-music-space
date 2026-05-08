"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { validateUpload } from "@/lib/uploadValidation";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

// "First track in 90 seconds" — three taps, three screens, ship a song.
// The full form at /studio/new?expert=1 still exists for power users.
//
// This component talks to the same /api/upload (signed PUT) and
// /api/songs/create endpoints as UploadTrackForm — only the UX differs.

const AUDIO_ACCEPT =
  "audio/*,audio/mp4,audio/x-m4a,audio/aiff,.mp3,.wav,.flac,.aac,.m4a,.aif,.aiff,.ogg,.oga,.opus,.webm";

const PRICE_PRESETS = [4.99, 9.99, 19.99, 49.99];
const SUPPLY_PRESETS = [50, 100, 500];

const STEP_LABELS: Record<Step, string> = { 1: "Audio", 2: "Details", 3: "Pricing" };

type Step = 1 | 2 | 3;
type AudioState = "idle" | "uploading" | "done" | "error";
const DRAFT_KEY = "ems_studio_quick_upload_draft_v1";

function buzz(ms = 30) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    // some browsers throw outside user gestures — safe to swallow
  }
}

interface Props {
  /** Logged-in user's display name, used to default the artist field. */
  defaultArtistName: string;
  /**
   * Audio URL pre-filled by an upstream uploader (e.g. the DAW's
   * MasterPublishBar). When present, step 1 is skipped and we land on
   * step 2 with the audio already marked done.
   */
  prefillAudioUrl?: string;
}

export default function QuickUploadFlow({
  defaultArtistName,
  prefillAudioUrl = "",
}: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(prefillAudioUrl ? 2 : 1);

  // Step 1
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioState, setAudioState] = useState<AudioState>(
    prefillAudioUrl ? "done" : "idle",
  );
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState(prefillAudioUrl);
  // Filename + size to display when the File object isn't around (e.g.
  // a localStorage draft restoration or a DAW-handoff prefill).
  const [audioMeta, setAudioMeta] = useState<{ name: string; size?: number } | null>(
    prefillAudioUrl ? { name: "Mix from DAW" } : null,
  );
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState(defaultArtistName);
  const [coverUrl, setCoverUrl] = useState("");
  const [coverGenerating, setCoverGenerating] = useState(false);
  // When the cover-generate route reports configMissing=true, hide the
  // generate button. The user can still proceed without a cover (it's
  // optional in the QuickUpload flow); we just stop advertising a
  // disabled feature.
  const [aiCoverDisabled, setAiCoverDisabled] = useState(false);

  // Step 3
  const [licensePrice, setLicensePrice] = useState("9.99");
  const [totalLicenses, setTotalLicenses] = useState("100");
  const [revenueSharePct, setRevenueSharePct] = useState("10");
  // License-aware export: defaults to ON because every stem published
  // becomes another loop in the marketplace, paying the artist a share
  // every time another producer uses it. Network-effect compounding.
  const [publishStems, setPublishStems] = useState(true);

  // shared
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [needsUpgrade, setNeedsUpgrade] = useState<{ message: string; upgradeUrl: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const startedAtRef = useRef<number>(0);

  // Preserve progress if the tab refreshes mid-flow. A DAW-handoff prefill
  // takes precedence — we don't want a stale draft to override a fresh
  // mix the user just published.
  useEffect(() => {
    if (prefillAudioUrl) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        step?: Step;
        title?: string;
        artist?: string;
        coverUrl?: string;
        licensePrice?: string;
        totalLicenses?: string;
        revenueSharePct?: string;
        audioUrl?: string;
        audioName?: string;
        audioSize?: number;
      };
      if (parsed.step) setStep(parsed.step);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.artist) setArtist(parsed.artist);
      if (parsed.coverUrl) setCoverUrl(parsed.coverUrl);
      if (parsed.licensePrice) setLicensePrice(parsed.licensePrice);
      if (parsed.totalLicenses) setTotalLicenses(parsed.totalLicenses);
      if (parsed.revenueSharePct) setRevenueSharePct(parsed.revenueSharePct);
      if (parsed.audioUrl) {
        setAudioUrl(parsed.audioUrl);
        setAudioState("done");
        setAudioMeta({
          name: parsed.audioName ?? "Saved upload",
          size: parsed.audioSize,
        });
      }
    } catch {
      // ignore corrupted local draft
    }
  }, [prefillAudioUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          title,
          artist,
          coverUrl,
          licensePrice,
          totalLicenses,
          revenueSharePct,
          audioUrl,
          audioName: audioFile?.name ?? audioMeta?.name,
          audioSize: audioFile?.size ?? audioMeta?.size,
        }),
      );
    } catch {
      // best effort only
    }
  }, [
    step,
    title,
    artist,
    coverUrl,
    licensePrice,
    totalLicenses,
    revenueSharePct,
    audioUrl,
    audioFile,
    audioMeta,
  ]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (publishing) return;
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (e.key === "Escape") {
        setError(null);
      }
      if (e.key !== "Enter" || !isTyping) return;
      if (step === 2) {
        const current = target as HTMLInputElement;
        if (current.name === "artist") {
          e.preventDefault();
          if (!title.trim()) return setError("Add a track title.");
          if (!artist.trim()) return setError("Add your artist name.");
          setError(null);
          setStep(3);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, title, artist, publishing]);

  useEffect(() => {
    startedAtRef.current = performance.now();
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadView,
      source: "studio_new_quick",
    });
  }, []);

  // ── Step 1: audio upload ────────────────────────────────────────────────
  async function startAudioUpload(file: File) {
    const check = validateUpload("audio", file);
    if (!check.ok) {
      setAudioState("error");
      setAudioFile(file);
      setError(check.reason);
      return;
    }
    setError(null);
    setAudioFile(file);
    setAudioMeta({ name: file.name, size: file.size });
    setAudioState("uploading");
    setAudioProgress(0);
    const startedAt = performance.now();
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadAudioSelected,
      source: "studio_new_quick",
      properties: { mimeType: file.type || "(empty)", fileSize: file.size },
    });
    try {
      const sig = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "audio",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const sigData = (await sig.json()) as {
        signedUrl?: string;
        publicUrl?: string;
        error?: string;
      };
      if (!sig.ok || !sigData.signedUrl || !sigData.publicUrl) {
        throw new Error(sigData.error ?? "Could not start upload. Try again.");
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sigData.signedUrl!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setAudioProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status}). Try again.`));
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.send(file);
      });

      setAudioUrl(sigData.publicUrl);
      setAudioState("done");
      buzz(40);
      void postFunnelEvent({
        event: FUNNEL_EVENTS.artistUploadAudioCompleted,
        source: "studio_new_quick",
        properties: {
          durationMs: Math.round(performance.now() - startedAt),
          fileSize: file.size,
        },
      });
      // Auto-advance once we have audio.
      setStep(2);
    } catch (err) {
      setAudioState("error");
      setAudioProgress(0);
      setError(err instanceof Error ? err.message : "Upload failed. Tap to try again.");
    }
  }

  function handleAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void startAudioUpload(file);
  }

  // ── Step 2: AI cover (optional) ─────────────────────────────────────────
  const generateCover = useCallback(async () => {
    const t = title.trim();
    if (!t) {
      setError("Add a track title first — the AI uses it to compose the cover.");
      return;
    }
    setError(null);
    setCoverGenerating(true);
    try {
      const res = await fetch("/api/cover/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t }),
      });
      const data = (await res.json()) as {
        imageBase64?: string;
        error?: string;
        configMissing?: boolean;
      };
      if (data.configMissing) {
        setAiCoverDisabled(true);
        setError(
          data.error ??
            "AI cover generation isn't available right now — this step is optional, you can keep going.",
        );
        return;
      }
      if (!res.ok || !data.imageBase64) {
        throw new Error(data.error ?? "Cover generation failed.");
      }
      // Convert base64 to a File and run through the existing upload pipeline.
      const bin = atob(data.imageBase64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const file = new File([buf], `cover-${Date.now()}.png`, { type: "image/png" });

      const sig = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "cover",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const sigData = (await sig.json()) as { signedUrl?: string; publicUrl?: string; error?: string };
      if (!sig.ok || !sigData.signedUrl || !sigData.publicUrl) {
        throw new Error(sigData.error ?? "Cover upload failed.");
      }
      await fetch(sigData.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      setCoverUrl(sigData.publicUrl);
      buzz(20);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover generation failed.");
    } finally {
      setCoverGenerating(false);
    }
  }, [title]);

  // ── Step 3: publish ─────────────────────────────────────────────────────
  async function publish() {
    if (publishing) return;
    setError(null);

    if (!title.trim()) {
      setError("Add a track title.");
      setStep(2);
      return;
    }
    if (!artist.trim()) {
      setError("Add your artist name.");
      setStep(2);
      return;
    }
    if (!audioUrl) {
      setError("Upload your audio first.");
      setStep(1);
      return;
    }

    setPublishing(true);
    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistUploadSubmitAttempt,
      source: "studio_new_quick",
      properties: {
        hasAudioUrl: true,
        hasCover: Boolean(coverUrl),
        hasStems: false,
      },
    });

    try {
      const res = await fetch("/api/songs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          audioUrl,
          coverUrl: coverUrl || undefined,
          allowFreeDownload: false,
          licensePrice: Number(licensePrice),
          revenueSharePct: Number(revenueSharePct),
          totalLicenses: Number(totalLicenses),
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: string;
        upgradeUrl?: string;
      };
      if (!res.ok || !data.id) {
        if (res.status === 401) {
          router.push("/auth/signin?callbackUrl=/studio/new");
          return;
        }
        if (res.status === 403) {
          // Two distinct 403s ship from /api/songs/create:
          //   1) role === "LISTENER" → user needs studio setup
          //   2) song count >= plan max → user needs to upgrade
          // Telling someone to "finish setup" when they actually need to
          // upgrade their plan kicked off a real-user infinite loop —
          // they'd save setup, retry, hit 403 again, get sent to setup
          // again. The server already returns `upgradeUrl` for the plan
          // case; route on its presence.
          if (data.upgradeUrl) {
            setNeedsUpgrade({
              message:
                data.error ??
                "You've hit your plan's song limit. Upgrade to publish more.",
              upgradeUrl: data.upgradeUrl,
            });
          } else {
            setNeedsSetup(true);
          }
          setPublishing(false);
          return;
        }
        throw new Error(data.error ?? "Publish failed. Try again.");
      }

      void postFunnelEvent({
        event: FUNNEL_EVENTS.artistUploadPublishCompleted,
        source: "studio_new_quick",
        properties: {
          publishDurationMs: Math.round(performance.now() - startedAtRef.current),
          hasStems: publishStems,
        },
      });
      // License-aware export: kick off Demucs separation in the
      // background so the new track auto-joins the Loop Browser. Failure
      // here is non-fatal — the song is published, the stems just won't
      // be available for remixing until the artist tries again.
      if (publishStems && data.id) {
        void fetch(`/api/songs/${data.id}/stems/separate`, { method: "POST" }).catch(
          () => {
            // best effort; surface in artist dashboard if this fails
          },
        );
      }
      buzz(80);
      localStorage.removeItem(DRAFT_KEY);
      // Land on the dedicated celebration page rather than the studio
      // hub — first publishes deserve a moment that feels like
      // *finishing the journey,* not a redirect.
      router.push(`/studio/published/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed. Try again.");
      setPublishing(false);
    }
  }

  const projectedEarnings =
    Number(licensePrice || 0) * Number(totalLicenses || 0);
  const creatorTakeRate = 1 - Number(revenueSharePct || 0) / 100;
  const projectedCreatorGross = projectedEarnings * creatorTakeRate;

  return (
    // iPhone home indicator eats ~34px at the bottom; the calc() class
    // keeps the Publish button visible above the indicator on Step 3.
    <div className="mx-auto max-w-xl px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:py-10">
      {/* Header — track count + step indicator + expert escape hatch */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
          {STEP_LABELS[step]} <span className="text-white/25">· Step {step} of 3</span>
        </p>
        <Link
          href="/studio/new?expert=1"
          className="text-xs text-white/45 underline-offset-2 hover:text-white/80 hover:underline"
        >
          More options
        </Link>
      </div>

      {/* Progress bar */}
      <div className="mb-7 grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 rounded-full transition ${
              s <= step ? "bg-gradient-to-r from-brand-500 to-accent-500" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {/* ── STEP 1: AUDIO ────────────────────────────────────────────── */}
      {step === 1 && (
        <section aria-label="Upload audio">
          <h1 className="text-3xl font-extrabold text-gradient-ems">Drop your track</h1>
          <p className="mt-2 text-sm text-white/55">
            MP3, WAV, FLAC, AAC, or M4A — up to 200 MB.
          </p>

          <button
            type="button"
            onClick={() => audioInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-brand-500/60", "bg-brand-500/5");
            }}
            onDragLeave={(e) =>
              e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5")
            }
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-brand-500/60", "bg-brand-500/5");
              const file = e.dataTransfer.files?.[0];
              if (file) void startAudioUpload(file);
            }}
            className="mt-6 flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.03] px-4 py-12 transition hover:border-brand-500/60 hover:bg-brand-500/5"
          >
            {audioState === "idle" && (
              <>
                <span className="text-5xl">🎵</span>
                <p className="text-sm font-semibold text-white/70 sm:hidden">
                  Tap to add from Files, iCloud, or your music library
                </p>
                <p className="hidden text-sm font-semibold text-white/70 sm:block">
                  Drop audio here or tap to browse
                </p>
              </>
            )}
{audioState === "uploading" && (audioFile || audioMeta) && (
               <div className="w-full">
                 <div className="flex items-center gap-3">
                   <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                   <p className="truncate text-sm font-medium">{audioFile?.name ?? audioMeta?.name}</p>
                 </div>
                 <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                   <progress
                     className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-brand-500 [&::-webkit-progress-value]:to-accent-500 [&::-moz-progress-bar]:bg-brand-500"
                     max={100}
                     value={audioProgress}
                     aria-label="Audio upload progress"
                   />
                 </div>
                 <p className="mt-1 text-xs text-brand-400">{audioProgress}%</p>
               </div>
             )}
            {audioState === "done" && (audioFile || audioMeta) && (
              <div className="flex items-center gap-3">
                <span className="text-2xl">✓</span>
                <p className="truncate text-sm font-medium text-green-400">
                  {(audioFile?.name ?? audioMeta?.name) ?? "Audio"} uploaded
                </p>
              </div>
            )}
            {audioState === "error" && (
              <p className="text-sm font-semibold text-red-400">Tap to try again</p>
            )}
          </button>
          <input
            ref={audioInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            aria-label="Audio track file"
            className="sr-only"
            onChange={handleAudioChange}
          />

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {audioState === "done" && (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-base font-bold text-white transition hover:opacity-90"
            >
              Next →
            </button>
          )}
        </section>
      )}

      {/* ── STEP 2: NAME IT ──────────────────────────────────────────── */}
      {step === 2 && (
        <section aria-label="Name your track">
          <h1 className="text-3xl font-extrabold text-gradient-ems">Name it</h1>
          <p className="mt-2 text-sm text-white/55">Title, artist name, optional cover.</p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
                Title
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                name="title"
                placeholder="Track title"
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/55">
                Artist
              </span>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                name="artist"
                placeholder="Your artist name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none"
              />
            </label>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                {coverUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={coverUrl}
                    alt="cover"
                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-2xl">
                    🎨
                  </div>
                )}
                <div className="flex-1 text-sm text-white/55">
                  Cover art is optional — the AI can compose one based on your title.
                </div>
              </div>
              {!aiCoverDisabled && (
                <button
                  type="button"
                  onClick={generateCover}
                  disabled={coverGenerating || !title.trim()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-sm font-bold text-brand-200 transition hover:bg-brand-500/20 disabled:opacity-40"
                >
                  {coverGenerating ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                      Generating…
                    </>
                  ) : coverUrl ? (
                    "✨ Generate another"
                  ) : (
                    "✨ Generate cover with AI"
                  )}
                </button>
              )}
              {aiCoverDisabled && (
                <p className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white/55">
                  AI cover generation is temporarily unavailable. This step
                  is optional — you can publish without a cover.
                </p>
              )}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/10"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (!title.trim()) {
                  setError("Add a track title.");
                  return;
                }
                if (!artist.trim()) {
                  setError("Add your artist name.");
                  return;
                }
                setError(null);
                setStep(3);
              }}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-base font-bold text-white/85 transition hover:bg-white/10"
            >
              Edit pricing →
            </button>
          </div>
          {/* Quick-publish: skip step 3 and ship with sensible defaults
              ($9.99 license, 100 licenses, 10% rev share). Most first-time
              publishers don't have an opinion on these — and "I want to
              ship now and tweak later" beats "I want to learn the pricing
              model before I publish." Defaults are visible underneath so
              they know what they're agreeing to. */}
          <button
            type="button"
            onClick={() => {
              if (!title.trim()) { setError("Add a track title."); return; }
              if (!artist.trim()) { setError("Add your artist name."); return; }
              setError(null);
              void publish();
            }}
            disabled={publishing}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-500 py-3 text-base font-extrabold text-black shadow-lg shadow-fuchsia-500/20 transition hover:opacity-95 disabled:opacity-60"
          >
            {publishing ? "Publishing…" : "🚀 Quick publish — use sensible defaults"}
          </button>
          <p className="mt-2 text-center text-[11px] text-white/45">
            Defaults: $9.99 per license · 100 licenses · 10% revenue share with holders.
            You can change these later in your dashboard.
          </p>
        </section>
      )}

      {/* ── STEP 3: PRICING ──────────────────────────────────────────── */}
      {step === 3 && (
        <section aria-label="Set your price">
          <h1 className="text-3xl font-extrabold text-gradient-ems">Set your price</h1>
          <p className="mt-2 text-sm text-white/55">
            Each license is one transferable share of your track.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/55">
                License price
              </span>
              <div className="flex flex-wrap gap-2">
                {PRICE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setLicensePrice(preset.toFixed(2))}
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                      Number(licensePrice) === preset
                        ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                        : "border-white/10 bg-white/5 text-white/65 hover:border-brand-500/30"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
                <div className="relative flex-1 min-w-[100px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/35">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.50"
                    step="0.01"
                    value={licensePrice}
                    onChange={(e) => setLicensePrice(e.target.value)}
                    aria-label="Custom license price"
                    className="w-full rounded-full border border-white/10 bg-white/5 py-2 pl-7 pr-3 text-sm text-white focus:border-brand-500/60 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/55">
                Total licenses
              </span>
              <div className="flex flex-wrap gap-2">
                {SUPPLY_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTotalLicenses(String(preset))}
                    className={`rounded-full border px-4 py-2 text-sm font-bold transition ${
                      Number(totalLicenses) === preset
                        ? "border-brand-500/60 bg-brand-500/15 text-brand-200"
                        : "border-white/10 bg-white/5 text-white/65 hover:border-brand-500/30"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="10000"
                  value={totalLicenses}
                  onChange={(e) => setTotalLicenses(e.target.value)}
                  aria-label="Custom license supply"
                  className="flex-1 min-w-[90px] rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand-500/60 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/55">
                Revenue share to license holders ({revenueSharePct}%)
              </span>
              <input
                type="range"
                min="1"
                max="50"
                step="1"
                value={revenueSharePct}
                onChange={(e) => setRevenueSharePct(e.target.value)}
                className="w-full accent-brand-500"
                aria-label="Revenue share percentage"
              />
              <p className="mt-1 text-xs text-white/40">
                License holders share {revenueSharePct}% of future stream + license revenue
                with you. The rest stays with you.
              </p>
            </div>

            <div className="rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/12 via-accent-500/6 to-transparent p-4">
              <p className="text-xs uppercase tracking-wider text-white/55">If all licenses sell</p>
              <p className="mt-1 text-3xl font-extrabold text-white">
                ${projectedEarnings.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-2 text-xs text-white/60">
                Estimated creator side before platform/payment fees:{" "}
                <span className="font-semibold text-white">
                  ${projectedCreatorGross.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </p>
            </div>

            {/* License-aware export — defaults ON because the Loop Browser
                only fills up if every new release publishes stems. The
                "extra revenue stream" framing is real: every remix that
                uses one of your stems pays you a 2% share of its revenue. */}
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-accent-500/30 bg-gradient-to-br from-accent-500/10 via-brand-500/5 to-transparent p-4">
              <input
                type="checkbox"
                checked={publishStems}
                onChange={(e) => setPublishStems(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-accent-500"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-white">
                  Also publish stems to the Loop Browser
                </p>
                <p className="mt-1 text-xs text-white/60">
                  AI splits your track into vocals/drums/bass/other and lists
                  them as remixable loops. Every producer who uses one routes{" "}
                  <span className="font-semibold text-accent-200">
                    2% of their track revenue back to you
                  </span>
                  . Free to enable.
                </p>
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {needsSetup && (
            <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="font-bold">One quick step before you publish.</p>
              <p className="mt-1 text-amber-200/85">
                Complete your studio profile (a username + bio, takes 30s) and
                EMS will mark you as an artist. Your draft is saved — you&apos;ll come
                right back here.
              </p>
              <Link
                href={`/studio/setup?next=${encodeURIComponent("/studio/new")}`}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-300"
              >
                Finish studio setup →
              </Link>
            </div>
          )}

          {needsUpgrade && (
            <div className="mt-4 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-4 text-sm text-fuchsia-100">
              <p className="font-bold">Plan limit reached.</p>
              <p className="mt-1 text-fuchsia-200/85">{needsUpgrade.message}</p>
              <Link
                href={needsUpgrade.upgradeUrl}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-fuchsia-400 px-4 py-2 text-sm font-bold text-fuchsia-950 transition hover:bg-fuchsia-300"
              >
                See plans →
              </Link>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={publishing}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={publishing || needsSetup || Boolean(needsUpgrade)}
              className="flex-1 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-3 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Publishing…
                </span>
              ) : (
                "Publish ⚡"
              )}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-white/35">
            By publishing, you agree to the{" "}
            <Link href="/legal/licensing" className="underline hover:text-white/60">
              EMS Licensing Agreement
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
