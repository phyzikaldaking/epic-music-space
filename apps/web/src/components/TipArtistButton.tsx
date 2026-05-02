"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const PRESETS = [2, 5, 10, 25];

interface Props {
  artistId: string;
  artistName: string;
}

export default function TipArtistButton({ artistId, artistName }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>("5");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!session) return null;

  async function handleTip() {
    setError("");
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 1) {
      setError("Minimum tip is $1.");
      return;
    }
    if (parsed > 10000) {
      setError("Maximum tip is $10,000.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, amount: parsed, message: message.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create tip.");
      } else {
        router.push(data.checkoutUrl);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-gold-300 transition hover:bg-gold-500/20"
      >
        💛 Tip Artist
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-extrabold">Tip {artistName}</h2>
            <p className="mb-5 text-sm text-white/50">
              100% goes to the artist — Stripe processing fees apply.
            </p>

            {/* Preset amounts */}
            <div className="mb-4 grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(String(p))}
                  className={`rounded-xl border py-2.5 text-sm font-bold transition ${
                    amount === String(p)
                      ? "border-gold-500/60 bg-gold-500/20 text-gold-300"
                      : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
                  }`}
                >
                  ${p}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-white/40">$</span>
              <input
                type="number"
                min="1"
                max="10000"
                step="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setError(""); }}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-8 pr-4 text-sm font-semibold focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/30"
              />
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 200))}
              placeholder="Leave a message (optional)"
              rows={3}
              className="mb-4 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
            <p className="mb-4 text-right text-[10px] text-white/25">{message.length}/200</p>

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-white/10 py-3 text-sm text-white/60 transition hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={handleTip}
                disabled={loading}
                className="flex-1 rounded-xl bg-gold-500 py-3 text-sm font-bold text-black transition hover:bg-gold-400 disabled:opacity-40"
              >
                {loading ? "Opening checkout…" : `Send $${amount || "—"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
