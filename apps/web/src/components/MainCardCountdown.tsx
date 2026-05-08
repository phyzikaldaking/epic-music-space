"use client";

import { useEffect, useState } from "react";

function fmt(ms: number): string {
  if (ms <= 0) return "Final";
  const s = Math.floor(ms / 1_000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

interface Props {
  /** ISO string from the server — e.g. match.endsAt.toISOString() */
  endsAt: string;
  className?: string;
}

/**
 * Live countdown timer for a versus match end time.
 * Renders a ticking clock that turns red in the final 5 minutes.
 */
export default function MainCardCountdown({ endsAt, className }: Props) {
  const [ms, setMs] = useState(() => new Date(endsAt).getTime() - Date.now());

  useEffect(() => {
    const tick = () => setMs(new Date(endsAt).getTime() - Date.now());
    tick();
    const t = setInterval(tick, 1_000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (ms <= 0) {
    return (
      <span className={`tabular-nums font-black text-white/40 ${className ?? ""}`}>
        Final
      </span>
    );
  }

  const urgent = ms < 5 * 60 * 1_000;
  return (
    <span
      className={`tabular-nums font-black ${
        urgent ? "animate-pulse text-rose-300" : "text-amber-200"
      } ${className ?? ""}`}
    >
      {fmt(ms)}
    </span>
  );
}
