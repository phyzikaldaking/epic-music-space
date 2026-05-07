"use client";

import { useState } from "react";

export default function BuyServiceButton({
  listingId,
  isInstant,
  paypalEnabled,
}: {
  listingId: string;
  isInstant: boolean;
  paypalEnabled: boolean;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "paypal">("stripe");
  const [brief, setBrief] = useState("");
  const [stemFile, setStemFile] = useState<File | null>(null);
  const [stemUrl, setStemUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleStems(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStemFile(file);
    setErr(null);
    setUploadState("uploading");
    setUploadProgress(0);

    try {
      const signedRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "stem",
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });
      const signed = await signedRes.json() as { signedUrl?: string; publicUrl?: string; error?: string };
      if (!signedRes.ok || !signed.signedUrl || !signed.publicUrl) {
        throw new Error(signed.error ?? "Upload failed");
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signed.signedUrl!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setStemUrl(signed.publicUrl);
      setUploadState("done");
      setUploadProgress(100);
    } catch (e) {
      setUploadState("error");
      setStemFile(null);
      setErr(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function handleBuy() {
    if (uploadState === "uploading") {
      setErr("Wait for the upload to finish.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/services/${listingId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: brief.trim() || undefined,
        briefUrl: stemUrl || undefined,
        paymentMethod,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setBusy(false);
      setErr(data.error ?? "Couldn't start checkout.");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-white/45">Payment method</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("stripe")}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              paymentMethod === "stripe"
                ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
            }`}
          >
            Stripe
          </button>
          <button
            type="button"
            onClick={() => paypalEnabled && setPaymentMethod("paypal")}
            disabled={!paypalEnabled}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              paymentMethod === "paypal"
                ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10"
            } disabled:opacity-45`}
            title={paypalEnabled ? "Pay with PayPal" : "PayPal is not configured yet"}
          >
            PayPal
          </button>
        </div>
      </div>

      {!isInstant && (
        <>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Brief: BPM, key, references, what you want done"
            rows={4}
            maxLength={2000}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-500/50"
          />

          <label
            htmlFor="stem-upload"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/3 px-4 py-3 text-xs font-semibold text-white/65 hover:border-brand-500/40"
          >
            <input
              id="stem-upload"
              type="file"
              accept=".zip,.wav,.mp3,.flac,.aiff,audio/*,application/zip"
              onChange={handleStems}
              className="hidden"
            />
            {stemFile ? (
              uploadState === "done" ? (
                <>✓ Stems uploaded — {stemFile.name}</>
              ) : uploadState === "uploading" ? (
                <>Uploading… {uploadProgress}%</>
              ) : (
                <>Re-upload stems</>
              )
            ) : (
              <>📦 Upload stems / track files (ZIP, WAV, MP3, FLAC)</>
            )}
          </label>
        </>
      )}

      <button
        type="button"
        onClick={handleBuy}
        disabled={busy || uploadState === "uploading"}
        className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {busy
          ? "Loading…"
          : paymentMethod === "paypal"
            ? (isInstant ? "Pay with PayPal & download" : "Book with PayPal")
            : (isInstant ? "Buy & download" : "Book service")}
      </button>
      {err && <p className="text-xs text-red-300">{err}</p>}
      <p className="text-center text-[10px] text-white/35">
        Secure checkout via {paymentMethod === "paypal" ? "PayPal" : "Stripe"}.{" "}
        {isInstant ? "Download link delivered after payment." : "You'll get a confirmation email and the engineer will reach out."}
      </p>
    </div>
  );
}
