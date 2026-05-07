"use client";

import { useState, useEffect } from "react";

export default function TrackLikeButton({ songId }: { songId: string }) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/tracks/${songId}/like`)
      .then((r) => r.json())
      .then((data: { liked: boolean; count: number }) => {
        setLiked(data.liked);
        setCount(data.count);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [songId]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);

    try {
      const res = await fetch(`/api/tracks/${songId}/like`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { liked: boolean; count: number };
        setLiked(data.liked);
        setCount(data.count);
      } else {
        // Revert on failure
        setLiked(prevLiked);
        setCount(prevCount);
      }
    } catch {
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white/30">
        <span className="h-4 w-4 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        liked
          ? "border-pink-500/30 bg-pink-500/10 text-pink-400 hover:bg-pink-500/20"
          : "border-white/10 bg-white/4 text-white/60 hover:text-white hover:bg-white/8"
      }`}
      aria-label={liked ? "Unlike this track" : "Like this track"}
    >
      <svg
        className={`h-4 w-4 transition-transform ${liked ? "scale-110" : ""}`}
        fill={liked ? "currentColor" : "none"}
        viewBox="0 0 24 24"
        strokeWidth={liked ? 0 : 2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
