"use client";

import { useState } from "react";

interface Props {
  limiterOn: boolean;
  canExport: boolean;
  emptyReason?: string;
  onToggleLimiter: () => void;
  onExport: () => Promise<Blob>;
  /** Hands the rendered WAV to the upload pipeline. Returns the new
   *  song ID or throws. */
  onPublish: (wav: Blob) => Promise<{ ok: boolean; message?: string }>;
  /** Bounce → upload → AI master (matchering) → load mastered as a
   *  new "Master (AI)" track. Provided by DawWorkspace.aiMasterMix. */
  onAiMaster?: (wav: Blob) => Promise<{ ok: boolean; message?: string }>;
}

type Phase = "idle" | "rendering" | "uploading" | "mastering" | "done" | "error";

export default function MasterPublishBar({
  limiterOn,
  canExport,
  emptyReason,
  onToggleLimiter,
  onExport,
  onPublish,
  onAiMaster,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

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

  async function renderAndPublish() {
    if (!canExport) {
      setPhase("error");
      setMessage(emptyReason ?? "Record audio or enable the beat machine before publishing.");
      return;
    }
    setPhase("rendering");
    setMessage("Rendering mix…");
    try {
      const blob = await onExport();
      setPhase("uploading");
      setMessage("Uploading to your catalog…");
      const result = await onPublish(blob);
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

      <button
        type="button"
        onClick={renderAndPublish}
        disabled={!canExport || phase === "rendering" || phase === "uploading" || phase === "mastering"}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-extrabold text-white hover:bg-brand-600 disabled:opacity-50 transition"
        title={canExport ? "Render and upload this session" : emptyReason}
      >
        {phase === "rendering" ? "Rendering…" : phase === "uploading" ? "Uploading…" : "Publish to catalog"}
      </button>

      {message && (
        <p
          className={`w-full text-[11px] ${
            phase === "error" ? "text-red-300" : "text-white/55"
          }`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
