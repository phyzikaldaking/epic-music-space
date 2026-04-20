"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Song {
  id: string;
  title: string;
  artist: string;
}

interface CreateBattleFormProps {
  songs: Song[];
}

export default function CreateBattleForm({ songs }: CreateBattleFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [songAId, setSongAId] = useState("");
  const [songBId, setSongBId] = useState("");
  const [durationHours, setDurationHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!songAId || !songBId) {
      setError("Select two songs to battle.");
      return;
    }
    if (songAId === songBId) {
      setError("A song cannot battle itself.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/versus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songAId, songBId, durationHours }),
      });

      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to create battle.");
        return;
      }

      setOpen(false);
      setSongAId("");
      setSongBId("");
      router.refresh();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (songs.length < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 glow-purple-sm"
      >
        ⚔️ Create Battle
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#141414] p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-extrabold">⚔️ Create Battle</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white transition text-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Song A */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                  Song A
                </label>
                <select
                  value={songAId}
                  onChange={(e) => setSongAId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white focus:border-brand-500/60 focus:outline-none"
                >
                  <option value="">Select a song…</option>
                  {songs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} — {s.artist}
                    </option>
                  ))}
                </select>
              </div>

              {/* VS divider */}
              <div className="text-center text-sm font-black text-white/20">VS</div>

              {/* Song B */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                  Song B
                </label>
                <select
                  value={songBId}
                  onChange={(e) => setSongBId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white focus:border-brand-500/60 focus:outline-none"
                >
                  <option value="">Select a song…</option>
                  {songs.filter((s) => s.id !== songAId).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} — {s.artist}
                    </option>
                  ))}
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                  Battle Duration
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white focus:border-brand-500/60 focus:outline-none"
                >
                  <option value={6}>6 hours</option>
                  <option value={12}>12 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                  <option value={72}>72 hours</option>
                </select>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-white/15 py-3 text-sm text-white/60 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50 glow-purple-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Creating…
                    </span>
                  ) : (
                    "Start Battle ⚔️"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
