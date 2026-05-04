"use client";

import { useState } from "react";

interface Props {
  songId: string;
  initiallySaved?: boolean;
  className?: string;
}

export default function SaveTrackButton({ songId, initiallySaved = false, className }: Props) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prev = saved;
    setSaved(!prev); // optimistic
    try {
      const res = await fetch("/api/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/auth/signin?callbackUrl=/track/${songId}`;
          return;
        }
        throw new Error();
      }
      const data = (await res.json()) as { saved: boolean };
      setSaved(data.saved);
    } catch {
      setSaved(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      title={saved ? "Remove from saved" : "Save for later"}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
        saved
          ? "border-pink-500/40 bg-pink-500/12 text-pink-300 hover:bg-pink-500/20"
          : "border-white/15 bg-white/4 text-white/70 hover:bg-white/10"
      } ${className ?? ""}`}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
      <span>{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
