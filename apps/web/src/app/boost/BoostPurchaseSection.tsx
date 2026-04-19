"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  packageId: string;
  isLoggedIn: boolean;
  songs: { id: string; title: string }[];
}

export default function BoostPurchaseSection({ packageId, isLoggedIn, songs }: Props) {
  const router = useRouter();
  const [selectedSongId, setSelectedSongId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <a
        href="/auth/signin?callbackUrl=/boost"
        className="mt-4 block w-full rounded-xl bg-brand-500/20 border border-brand-500/40 py-3 text-center text-sm font-semibold text-brand-400 hover:bg-brand-500/30 transition"
      >
        Sign in to Boost
      </a>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="mt-4 rounded-lg bg-white/5 p-3 text-center text-xs text-white/30">
        <a href="/studio/new" className="text-brand-400 hover:underline">
          Upload a track first
        </a>{" "}
        to use boosts.
      </div>
    );
  }

  async function handleBoost() {
    if (!selectedSongId) {
      setError("Please select a track to boost.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: selectedSongId, packageId }),
      });

      const data = await res.json() as { checkoutUrl?: string; error?: string };

      if (!res.ok || !data.checkoutUrl) {
        setError(data.error ?? "Failed to start checkout. Please try again.");
        return;
      }

      // Redirect to Stripe checkout
      router.push(data.checkoutUrl);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <select
        value={selectedSongId}
        onChange={(e) => setSelectedSongId(e.target.value)}
        className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white border border-white/10 focus:outline-none focus:border-brand-500/60"
      >
        <option value="">Select a track…</option>
        {songs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={handleBoost}
        className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-3 text-sm font-bold text-white hover:opacity-90 transition glow-purple disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Redirecting…
          </span>
        ) : (
          "Boost Now ⚡"
        )}
      </button>
    </div>
  );
}
