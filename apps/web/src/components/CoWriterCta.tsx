"use client";

import { useEffect, useState } from "react";

interface Mine {
  id: string;
  status: string;
  shareBpsRequested: number;
  priceCents: number;
  message: string | null;
}

interface Props {
  songId: string;
  songTitle: string;
  /** True when the viewer is the artist of this track (don't tease their own song to themselves). */
  viewerIsArtist: boolean;
  signedIn: boolean;
}

const SHARE_PRESETS = [
  { bps: 25, price: 2500, label: "0.25%", price_label: "$25" },
  { bps: 50, price: 5000, label: "0.5%", price_label: "$50" },
  { bps: 100, price: 10000, label: "1%", price_label: "$100" },
  { bps: 200, price: 20000, label: "2%", price_label: "$200" },
];

export default function CoWriterCta({
  songId,
  songTitle,
  viewerIsArtist,
  signedIn,
}: Props) {
  const [open, setOpen] = useState(false);
  const [queueSize, setQueueSize] = useState(0);
  const [mine, setMine] = useState<Mine | null>(null);
  const [selected, setSelected] = useState<number>(50);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/songs/${songId}/cowriter`)
      .then((r) => r.json())
      .then((data: { queueSize: number; mine: Mine | null }) => {
        setQueueSize(data.queueSize);
        if (data.mine) {
          setMine(data.mine);
          setSelected(data.mine.shareBpsRequested);
          setMessage(data.mine.message ?? "");
        }
      })
      .catch(() => {});
  }, [songId]);

  if (viewerIsArtist) return null;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const preset = SHARE_PRESETS.find((p) => p.bps === selected);
      const res = await fetch(`/api/songs/${songId}/cowriter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareBpsRequested: selected,
          priceCents: preset?.price ?? 5000,
          message: message.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        interest?: Mine;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't send your request. Try again.");
        return;
      }
      if (data.interest) {
        setMine(data.interest);
        setQueueSize((q) => q + (mine ? 0 : 1));
      }
      setSuccess(data.message ?? "Request sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/85">
            Become a Co-Writer · New
          </p>
          <p className="mt-1 text-base font-bold text-white">
            Buy a writer&apos;s share of &ldquo;{songTitle}&rdquo;.
          </p>
          <p className="mt-1 text-sm text-white/65">
            You&apos;re a stakeholder. Your name lands in the credits, you earn
            a percentage of every license + stream royalty for the life of the
            track. Limited shares — first come, first served.
            {queueSize > 0 && (
              <span className="ml-1 font-semibold text-amber-200">
                {queueSize} {queueSize === 1 ? "fan" : "fans"} ahead of you.
              </span>
            )}
          </p>
        </div>
      </div>

      {!open && !mine && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-extrabold text-amber-950 shadow-lg shadow-amber-500/25 transition hover:opacity-95 active:scale-[0.99]"
        >
          ⭐ Request a Co-Writer Share →
        </button>
      )}

      {mine && !open && (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-3">
          <p className="text-sm font-semibold text-amber-200">
            Request {mine.status === "PENDING" ? "pending" : mine.status.toLowerCase()}.
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            You asked for{" "}
            <span className="font-bold text-white">
              {(mine.shareBpsRequested / 100).toFixed(2)}%
            </span>{" "}
            for{" "}
            <span className="font-bold text-white">
              ${(mine.priceCents / 100).toFixed(0)}
            </span>
            . The artist will review and either accept or decline. You&apos;re
            not charged until they accept.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 text-xs font-semibold text-amber-300 underline-offset-2 hover:underline"
          >
            Update request
          </button>
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3">
          {!signedIn && (
            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
              Sign in to send the artist a co-writer request.
            </p>
          )}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/55">
              Share size
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SHARE_PRESETS.map((p) => (
                <button
                  key={p.bps}
                  type="button"
                  onClick={() => setSelected(p.bps)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected === p.bps
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                      : "border-white/10 bg-white/[0.03] text-white/65 hover:border-amber-500/30"
                  }`}
                >
                  <p className="text-base font-extrabold">{p.label}</p>
                  <p className="text-[11px] text-white/50">{p.price_label}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/55">
              Message to the artist (optional)
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell them why this song means something to you…"
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-amber-500/60 focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {success}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !signedIn}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-extrabold text-amber-950 shadow-lg shadow-amber-500/25 transition hover:opacity-95 disabled:opacity-50 active:scale-[0.99]"
            >
              {submitting ? "Sending…" : mine ? "Update request" : "Send request to artist"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm font-semibold text-white/55 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-white/35">
            You won&apos;t be charged until the artist accepts. If they decline,
            no payment is collected and the request is closed.
          </p>
        </div>
      )}
    </div>
  );
}
