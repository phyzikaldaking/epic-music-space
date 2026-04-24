"use client";

import { useState } from "react";

interface Props {
  labelId: string;
}

export default function LabelInviteForm({ labelId }: Props) {
  const [artistId, setArtistId] = useState("");
  const [revShare, setRevShare] = useState("10");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch(`/api/labels/${labelId}/artists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: artistId.trim(), revSharePct: Number(revShare) }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Failed to send offer.");
        setStatus("error");
        return;
      }
      setMessage("Offer sent — the artist will be notified.");
      setStatus("success");
      setArtistId("");
      setRevShare("10");
    } catch {
      setMessage("An unexpected error occurred.");
      setStatus("error");
    }
  }

  return (
    <section className="glass rounded-2xl p-5">
      <h3 className="mb-1 font-semibold">Sign an Artist</h3>
      <p className="mb-4 text-xs text-white/40">
        Enter the artist&apos;s user ID and a revenue-share percentage to send them a signing offer.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Artist User ID
          </label>
          <input
            type="text"
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            placeholder="cuid of the artist's account"
            required
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Revenue Share %
          </label>
          <input
            type="number"
            value={revShare}
            onChange={(e) => setRevShare(e.target.value)}
            min={1}
            max={50}
            required
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>
        {message && (
          <p className={`text-sm ${status === "success" ? "text-green-400" : "text-red-400"}`}>
            {message}
          </p>
        )}
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {status === "loading" ? "Sending…" : "Send Offer"}
        </button>
      </form>
    </section>
  );
}
