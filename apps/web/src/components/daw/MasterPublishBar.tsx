"use client";

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { computeMonoCompat, type MonoCompatReport } from "@/lib/monoCompat";
import { computeLoudnessReport, type LoudnessReport } from "@/lib/loudnessGate";

interface Props {
  limiterOn: boolean;
  canExport: boolean;
  emptyReason?: string;
  loudnessPreset: "streaming" | "club" | "broadcast";
  truePeakTarget: -1 | -1.2 | -2;
  onSetLoudnessPreset: (preset: "streaming" | "club" | "broadcast") => void;
  onSetTruePeakTarget: (target: -1 | -1.2 | -2) => void;
  onToggleLimiter: () => void;
  onExport: () => Promise<Blob>;
  /** Hands the rendered WAV to the upload pipeline. Returns the new
   *  song ID or throws. The optional `coverArtDataUrl` is the user's
   *  pick from the AI cover-art generator (#5) — caller can persist it
   *  alongside the audio. */
  onPublish: (
    wav: Blob,
    opts?: { coverArtDataUrl?: string },
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Bounce → upload → AI master (matchering) → load mastered as a
   *  new "Master (AI)" track. Provided by DawWorkspace.aiMasterMix. */
  onAiMaster?: (wav: Blob) => Promise<{ ok: boolean; message?: string }>;
  /** Render the current session and POST it to /api/guest-share so the
   *  user gets a public preview link they can copy and text to a friend.
   *  Anonymous, 7-day TTL — meant for "play this for someone" not
   *  "publish for licensing." */
  onSharePreview?: (wav: Blob) => Promise<{ ok: boolean; shareUrl?: string; message?: string }>;
  /** When set, the publish bar shows a "Public share" toggle that flips
   *  the StudioProject row's isPublic flag (#9). Null when no project
   *  has been saved yet — caller hides the row. */
  shareLink?: {
    projectId: string;
    isPublic: boolean;
    onToggle: (next: boolean) => Promise<boolean>;
  };
}

type Phase = "idle" | "rendering" | "uploading" | "mastering" | "sharing" | "done" | "error";

export default function MasterPublishBar({
  limiterOn,
  canExport,
  emptyReason,
  loudnessPreset,
  shareLink,
  truePeakTarget,
  onSetLoudnessPreset,
  onSetTruePeakTarget,
  onToggleLimiter,
  onExport,
  onPublish,
  onAiMaster,
  onSharePreview,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  // Pre-publish preview: hold the rendered Blob + a temporary URL while
  // the user listens. Confirming in the modal commits the publish.
  const [pendingPublish, setPendingPublish] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);
  // Mono-compatibility report computed off the rendered blob. Drives the
  // phase warning in the preview modal. Reset between renders.
  const [monoReport, setMonoReport] = useState<MonoCompatReport | null>(null);
  const [loudnessReport, setLoudnessReport] = useState<LoudnessReport | null>(
    null,
  );
  // AI cover art (#5). Three base64 candidates streamed back from the
  // /api/ai/cover-art endpoint after the user clicks "Generate covers".
  // Selection is staged here and passed to onPublish once the user
  // commits. Lives inside the publish modal lifecycle.
  const [coverArtOptions, setCoverArtOptions] = useState<string[] | null>(null);
  const [coverArtPick, setCoverArtPick] = useState<number | null>(null);
  const [coverArtBusy, setCoverArtBusy] = useState(false);
  const [coverArtError, setCoverArtError] = useState<string | null>(null);

  async function renderAndDownload() {
    if (!canExport) {
      setPhase("error");
      setMessage(emptyReason ?? "Record audio or enable the beat machine before rendering.");
      return;
    }
    setPhase("rendering");
    setMessage("Rendering mix…");
    try {
      const blob = await onExport();
      // Replace the previous URL so we don't leak object URLs across renders.
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setPhase("done");
      setMessage(`Rendered ${(blob.size / 1024 / 1024).toFixed(2)} MB · click Download to save`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Render failed.");
    }
  }

  async function renderAndMaster() {
    if (!onAiMaster) return;
    if (!canExport) {
      setPhase("error");
      setMessage(emptyReason ?? "Record audio or enable the beat machine before mastering.");
      return;
    }
    setPhase("rendering");
    setMessage("Rendering mix for AI mastering…");
    try {
      const blob = await onExport();
      setPhase("mastering");
      setMessage("AI mastering — matchering against a streaming-target reference (~60s)…");
      const result = await onAiMaster(blob);
      if (result.ok) {
        setPhase("done");
        setMessage(result.message ?? "Mastered. Listen to the new 'Master (AI)' track.");
      } else {
        setPhase("error");
        setMessage(result.message ?? "Mastering failed.");
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Mastering failed.");
    }
  }

  async function renderAndShare() {
    if (!onSharePreview) return;
    if (!canExport) {
      setPhase("error");
      setMessage(emptyReason ?? "Record audio or enable the beat machine before sharing.");
      return;
    }
    setPhase("rendering");
    setMessage("Rendering preview…");
    try {
      const blob = await onExport();
      setPhase("sharing");
      setMessage("Uploading preview to a temporary public link…");
      const result = await onSharePreview(blob);
      if (result.ok && result.shareUrl) {
        setShareUrl(result.shareUrl);
        setPhase("done");
        // Best-effort clipboard copy. If it fails (HTTP, focus, perms),
        // the URL is still rendered as a clickable link below the bar.
        try {
          await navigator.clipboard.writeText(result.shareUrl);
          setMessage(`Copied to clipboard. Link expires in 7 days.`);
        } catch {
          setMessage("Link ready. Click to copy.");
        }
      } else {
        setPhase("error");
        setMessage(result.message ?? "Couldn't create share link.");
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Share failed.");
    }
  }

  async function renderAndPublish() {
    if (!canExport) {
      setPhase("error");
      setMessage(emptyReason ?? "Record audio or enable the beat machine before publishing.");
      return;
    }
    setPhase("rendering");
    setMessage("Rendering mix for preview…");
    try {
      const blob = await onExport();
      const url = URL.createObjectURL(blob);
      // Hand off to the preview modal. The modal calls confirmPublish on
      // approval; cancellation revokes the URL and resets state.
      setPendingPublish({ blob, url });
      setPhase("idle");
      setMessage("Preview your render before publishing.");
      // Run the mono-compat check in parallel with the user listening —
      // it decodes the full WAV (1–3s for a 3-min track) so it shouldn't
      // gate the preview modal opening. Result lands when ready.
      setMonoReport(null);
    setLoudnessReport(null);
      void computeMonoCompat(blob)
        .then((report) => setMonoReport(report))
        .catch(() => setMonoReport(null));
      // Pre-publish loudness gate (#F34). Same async pattern — decodes
      // the WAV again (cheap, both reads hit the browser's audio
      // decoder which caches the underlying buffer). Result powers a
      // warning banner if the master is too quiet / hot / clipping
      // for the chosen loudness preset.
      setLoudnessReport(null);
      void computeLoudnessReport(blob, loudnessPreset)
        .then((report) => setLoudnessReport(report))
        .catch(() => setLoudnessReport(null));
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Render failed.");
    }
  }

  async function confirmPublish() {
    if (!pendingPublish) return;
    const { blob, url } = pendingPublish;
    const chosenCover =
      coverArtPick !== null && coverArtOptions
        ? coverArtOptions[coverArtPick]
        : undefined;
    setPendingPublish(null);
    setCoverArtOptions(null);
    setCoverArtPick(null);
    setMonoReport(null);
    setLoudnessReport(null);
    setPhase("uploading");
    setMessage("Uploading to your catalog…");
    try {
      const result = await onPublish(blob, { coverArtDataUrl: chosenCover });
      URL.revokeObjectURL(url);
      if (result.ok) {
        setPhase("done");
        setMessage(result.message ?? "Published. Check your studio profile.");
      } else {
        setPhase("error");
        setMessage(result.message ?? "Publish failed.");
      }
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Publish failed.");
    }
  }

  function cancelPreview() {
    if (pendingPublish) URL.revokeObjectURL(pendingPublish.url);
    setPendingPublish(null);
    setCoverArtOptions(null);
    setCoverArtPick(null);
    setCoverArtError(null);
    setMonoReport(null);
    setLoudnessReport(null);
    setPhase("idle");
    setMessage("");
  }

  async function generateCoverArt(trackName: string) {
    if (coverArtBusy) return;
    setCoverArtBusy(true);
    setCoverArtError(null);
    try {
      const res = await fetch("/api/ai/cover-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackName, count: 3 }),
      });
      if (res.status === 401) {
        setCoverArtError("Sign in to generate cover art.");
        return;
      }
      if (res.status === 429) {
        setCoverArtError("Slow down — wait a minute and try again.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { images?: string[]; error?: string };
      if (!res.ok) {
        setCoverArtError(data.error ?? "Couldn't generate covers.");
        return;
      }
      setCoverArtOptions(data.images ?? []);
      setCoverArtPick(0);
    } catch {
      setCoverArtError("Network error.");
    } finally {
      setCoverArtBusy(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#0c0c14] via-[#0a0a12] to-[#0c0c14] p-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300/85">
          Master · Publish
        </p>
        <p className="mt-0.5 text-xs text-white/55">
          Limiter at -3 dB · ultra-quality 24-bit WAV render · hand off to licensing and catalog details.
        </p>
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleLimiter}
        className={`rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-widest transition ${
          limiterOn ? "bg-emerald-500 text-black" : "border border-white/15 text-white/65 hover:bg-white/10"
        }`}
        title="Master limiter — protects against clipping at -3 dB"
      >
        Limiter {limiterOn ? "on" : "off"}
      </button>

      <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/65">
        Target
        <select
          value={loudnessPreset}
          onChange={(event) => onSetLoudnessPreset(event.target.value as "streaming" | "club" | "broadcast")}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
          title="Export loudness target"
        >
          <option value="streaming">Streaming (-14)</option>
          <option value="club">Club (-9)</option>
          <option value="broadcast">Broadcast (-16)</option>
        </select>
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/65">
        Peak
        <select
          value={String(truePeakTarget)}
          onChange={(event) => onSetTruePeakTarget(Number(event.target.value) as -1 | -1.2 | -2)}
          className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white"
          title="True peak ceiling guard"
        >
          <option value="-1">-1.0 dBTP</option>
          <option value="-1.2">-1.2 dBTP</option>
          <option value="-2">-2.0 dBTP</option>
        </select>
      </label>

      <button
        type="button"
        onClick={renderAndDownload}
        disabled={!canExport || phase === "rendering" || phase === "uploading"}
        className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white/85 hover:bg-white/10 disabled:opacity-50 transition"
        title={canExport ? "Render the current session to WAV" : emptyReason}
      >
        Render WAV
      </button>

      {downloadUrl && phase !== "rendering" && phase !== "uploading" && (
        <a
          href={downloadUrl}
          download={`ems-mix-${Date.now()}.wav`}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25 transition"
        >
          Download
        </a>
      )}

      {onAiMaster && (
        <button
          type="button"
          onClick={renderAndMaster}
          disabled={!canExport || phase === "rendering" || phase === "uploading" || phase === "mastering"}
          className="rounded-lg border border-amber-400/40 bg-gradient-to-br from-amber-400/15 via-orange-500/10 to-transparent px-4 py-2 text-sm font-extrabold text-amber-100 transition hover:from-amber-400/25 hover:to-orange-500/20 disabled:opacity-50"
          title={canExport ? "AI master this mix to a streaming-target loudness curve" : emptyReason}
        >
          {phase === "mastering" ? "Mastering…" : "✨ AI Master"}
        </button>
      )}

      {onSharePreview && (
        <button
          type="button"
          onClick={renderAndShare}
          disabled={
            !canExport ||
            phase === "rendering" ||
            phase === "uploading" ||
            phase === "mastering" ||
            phase === "sharing"
          }
          className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50 transition"
          title={canExport ? "Render and create a 7-day public preview link" : emptyReason}
        >
          {phase === "sharing" ? "Sharing…" : "Share preview"}
        </button>
      )}

      <button
        type="button"
        onClick={renderAndPublish}
        disabled={!canExport || phase === "rendering" || phase === "uploading" || phase === "mastering" || phase === "sharing"}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-600 disabled:opacity-50 transition"
        title={canExport ? "Render and upload this session" : emptyReason}
      >
        {phase === "rendering" ? "Rendering…" : phase === "uploading" ? "Uploading…" : "Publish to catalog"}
      </button>

      {shareLink ? <ShareLinkRow shareLink={shareLink} /> : null}

      {shareUrl && phase !== "rendering" && phase !== "uploading" && phase !== "sharing" && (
        <div className="w-full rounded-lg border border-cyan-400/30 bg-cyan-400/5 px-3 py-2 text-xs">
          <p className="mb-1 font-bold uppercase tracking-widest text-cyan-200/85">
            Preview link · expires in 7 days
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Public preview share link"
              className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 py-1 font-mono text-[11px] text-cyan-100"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl).then(
                  () => setMessage("Copied to clipboard."),
                  () => setMessage("Press ⌘C / Ctrl+C to copy."),
                );
              }}
              className="rounded border border-cyan-400/40 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/15"
            >
              Copy
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-white/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-white/80 hover:bg-white/10"
            >
              Open
            </a>
          </div>
        </div>
      )}

      {message && (
        <p
          className={`w-full text-[11px] ${
            phase === "error" ? "text-red-300" : "text-white/55"
          }`}
        >
          {message}
        </p>
      )}

      {pendingPublish && (
        <RenderPreviewModal
          url={pendingPublish.url}
          monoReport={monoReport}
          loudnessReport={loudnessReport}
          coverArt={{
            busy: coverArtBusy,
            error: coverArtError,
            options: coverArtOptions,
            pick: coverArtPick,
            onPick: setCoverArtPick,
            onGenerate: () => generateCoverArt("New track"),
          }}
          onCancel={cancelPreview}
          onRerender={() => {
            cancelPreview();
            void renderAndPublish();
          }}
          onConfirm={() => {
            void confirmPublish();
          }}
        />
      )}
    </section>
  );
}

/** AI-generated cover-art picker shown in the publish preview modal (#5).
 *  Three candidates render as 1024×1024 thumbnails; the chosen one (or
 *  none) is passed to onPublish so the parent can persist it alongside
 *  the audio. Generation is opt-in via the "Generate covers" button so
 *  every publish doesn't burn $0.12. */
function CoverArtPicker({
  busy,
  error,
  options,
  pick,
  onPick,
  onGenerate,
}: {
  busy: boolean;
  error: string | null;
  options: string[] | null;
  pick: number | null;
  onPick: (idx: number | null) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-tube-300/30 bg-tube-300/[0.04] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
            Cover art · AI
          </p>
          <p className="mt-0.5 text-[11px] text-white/55">
            Optional. Generates 3 candidates you can pick from.
          </p>
        </div>
        {!options && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-md border border-tube-300/40 bg-tube-300/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-tube-100 hover:bg-tube-300/25 transition disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate covers"}
          </button>
        )}
        {options && (
          <button
            type="button"
            onClick={() => onPick(null)}
            className="rounded-md border border-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/10 transition"
          >
            Skip cover
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
      {options && options.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {options.map((src, idx) => {
            const selected = pick === idx;
            const className = `overflow-hidden rounded-lg border-2 transition ${
              selected
                ? "border-tube-300 ring-2 ring-tube-300/60"
                : "border-white/10 hover:border-tube-300/50"
            }`;
            const img = (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`Cover option ${idx + 1}`}
                className="aspect-square w-full object-cover"
              />
            );
            return selected ? (
              <button
                key={idx}
                type="button"
                onClick={() => onPick(idx)}
                aria-pressed="true"
                className={className}
              >
                {img}
              </button>
            ) : (
              <button
                key={idx}
                type="button"
                onClick={() => onPick(idx)}
                aria-pressed="false"
                className={className}
              >
                {img}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Public share link" toggle (#9). Flips the StudioProject row's
 *  isPublic flag. When on, the listen page at /studio/listen/[id] is
 *  reachable without auth — like SoundCloud's unlisted-link mode. */
function ShareLinkRow({
  shareLink,
}: {
  shareLink: NonNullable<Props["shareLink"]>;
}) {
  const [isPublic, setIsPublic] = useState(shareLink.isPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsPublic(shareLink.isPublic);
  }, [shareLink.isPublic]);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/studio/listen/${shareLink.projectId}`
      : `/studio/listen/${shareLink.projectId}`;

  async function toggle() {
    setBusy(true);
    try {
      const next = !isPublic;
      const ok = await shareLink.onToggle(next);
      if (ok) setIsPublic(next);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard API may be unavailable in some contexts
    }
  }

  const toggleClass = `rounded-md px-2.5 py-1 text-[11px] font-black uppercase tracking-widest transition disabled:opacity-50 ${
    isPublic
      ? "bg-tube-300/30 text-tube-100"
      : "border border-tube-300/35 text-tube-200 hover:bg-tube-300/15"
  }`;
  const toggleLabel = busy ? "…" : isPublic ? "✓ Public link on" : "Enable share link";
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-tube-300/30 bg-tube-300/5 px-3 py-2 text-xs">
      {isPublic ? (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed="true"
          className={toggleClass}
        >
          {toggleLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed="false"
          className={toggleClass}
        >
          {toggleLabel}
        </button>
      )}
      {isPublic && (
        <>
          <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-[11px] text-tube-200">
            {url}
          </code>
          <button
            type="button"
            onClick={copy}
            className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-bold text-white/70 hover:bg-white/10 transition"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          {/* "View as visitor" — opens the read-only listen page in a
              new tab so the producer can hear what fans will hear
              before sending the URL. Closes the integration gap from
              #21 (the link existed but had no visible entry point). */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-tube-300/35 bg-tube-300/10 px-2 py-1 text-[11px] font-bold text-tube-100 hover:bg-tube-300/20 transition"
          >
            View ↗
          </a>
        </>
      )}
    </div>
  );
}

/** Render-preview modal extracted from MasterPublishBar so it can own a
 *  focus trap independent of the rest of the bar (#25). The trap auto-
 *  focuses the Cancel button on open and restores focus on close. */
function RenderPreviewModal({
  url,
  monoReport,
  loudnessReport,
  coverArt,
  onCancel,
  onRerender,
  onConfirm,
}: {
  url: string;
  /** Mono-compatibility report. null while the check is still running
   *  (decodes the WAV — a few seconds for long tracks). Drives the
   *  phase-issue warning banner below the player. */
  monoReport: MonoCompatReport | null;
  /** Loudness gate report (#F34). null while running. Drives the
   *  too-quiet / too-loud / clipping warning. */
  loudnessReport: LoudnessReport | null;
  coverArt: {
    busy: boolean;
    error: string | null;
    options: string[] | null;
    pick: number | null;
    onPick: (idx: number | null) => void;
    onGenerate: () => void;
  };
  onCancel: () => void;
  onRerender: () => void;
  onConfirm: () => void;
}) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Render preview"
      ref={focusTrapRef}
      className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
    >
      <div className="w-[min(560px,100%)] rounded-2xl border border-emerald-400/35 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-emerald-300/85">
          Last check
        </p>
        <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
          Preview before publishing
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          Listen back to the rendered mix. Catch dead air at the start,
          clipping, or accidentally muted tracks before this goes public.
        </p>

        <audio src={url} controls autoPlay className="mt-4 w-full">
          <track kind="captions" />
        </audio>

        <MonoCompatWarning report={monoReport} />
        <LoudnessWarning report={loudnessReport} />

        <CoverArtPicker
          busy={coverArt.busy}
          error={coverArt.error}
          options={coverArt.options}
          pick={coverArt.pick}
          onPick={coverArt.onPick}
          onGenerate={coverArt.onGenerate}
        />

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onRerender}
            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-400/20 transition"
          >
            Re-render
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-emerald-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-black transition hover:bg-emerald-400"
          >
            Sounds good — Publish
          </button>
        </div>
      </div>
    </div>
  );
}

// Mono-compatibility warning shown in the preview modal. Surfaces only
// when the L+R sum is >6 dB quieter than the stereo image — a strong
// signal that something on the mix is anti-phase and the track will
// collapse on phone speakers / Bluetooth. Silent when the check is still
// running or when the mix is fine, so it never adds noise to a clean
// publish flow.
function MonoCompatWarning({ report }: { report: MonoCompatReport | null }) {
  if (!report) return null;
  if (!report.hasPhaseIssue) return null;
  const lostDb = Math.abs(report.deltaDb).toFixed(1);
  return (
    <div className="mt-4 rounded-xl border border-rose-400/45 bg-rose-500/[0.08] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-200">
        Phase warning · mono drops {lostDb} dB
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/75">
        Something in your mix is anti-phased — when this plays on a phone
        speaker or Bluetooth, it&apos;ll sound gutted. Common culprits: a
        too-wide stereo synth, a dry/wet reverb pulling against itself,
        or a vocal doubler with inverted polarity.
      </p>
    </div>
  );
}

// Pre-publish loudness gate warning (#F34). Green = good, amber = low/
// high, red = clipping. Always renders something when the report has
// landed — producers want positive confirmation that the master is in
// range before publishing, not just warnings.
function LoudnessWarning({ report }: { report: LoudnessReport | null }) {
  if (!report) return null;
  if (report.verdict === "good") {
    return (
      <div className="mt-4 rounded-xl border border-emerald-400/45 bg-emerald-500/[0.08] p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200">
          Loudness gate · pass
        </p>
        <p className="mt-1 text-xs leading-relaxed text-white/75">
          {report.message}
        </p>
      </div>
    );
  }
  const isRed = report.verdict === "clipping" || report.verdict === "silent";
  const border = isRed ? "border-rose-400/45" : "border-amber-400/45";
  const bg = isRed ? "bg-rose-500/[0.08]" : "bg-amber-500/[0.08]";
  const heading = isRed ? "text-rose-200" : "text-amber-200";
  return (
    <div className={`mt-4 rounded-xl border ${border} ${bg} p-3`}>
      <p className={`text-[10px] font-black uppercase tracking-[0.28em] ${heading}`}>
        Loudness gate · {report.verdict}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/75">
        {report.message}
      </p>
    </div>
  );
}
