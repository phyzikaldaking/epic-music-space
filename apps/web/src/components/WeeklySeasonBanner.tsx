"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Resetting now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const mins = Math.floor((totalSeconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h until reset`;
  if (hours > 0) return `${hours}h ${mins}m until reset`;
  return `${mins}m until reset`;
}

export interface WeeklyLeaderEntry {
  name: string;
  points: number;
}

interface Props {
  weekLabel: string;
  /** ms until reset — computed server-side; client ticks it live. */
  resetMs: number;
  /** Date.now() captured at SSR so the client can account for transit time. */
  renderedAt: number;
  topArtists: WeeklyLeaderEntry[];
  liveMatchCount: number;
}

export default function WeeklySeasonBanner({
  weekLabel,
  resetMs,
  renderedAt,
  topArtists,
  liveMatchCount,
}: Props) {
  const [msLeft, setMsLeft] = useState<number>(resetMs);

  useEffect(() => {
    // Adjust for time elapsed during SSR → hydration transit
    const offset = Date.now() - renderedAt;
    const adjusted = Math.max(0, resetMs - offset);
    setMsLeft(adjusted);

    const timer = setInterval(() => {
      setMsLeft((prev) => Math.max(0, prev - 1_000));
    }, 1_000);
    return () => clearInterval(timer);
  }, [resetMs, renderedAt]);

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[#0d0a1a] via-[#0b1220] to-[#0d0a1a]">
      {/* ── Top strip — season label + countdown ──────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-white/8 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-400/40 bg-brand-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-brand-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
            Live Season
          </span>
          <span className="text-xs font-bold text-white/80">{weekLabel}</span>
        </div>
        <span className="tabular-nums text-[11px] font-semibold text-white/45">
          {formatCountdown(msLeft)}
        </span>
      </div>

      {/* ── Body — points economy + artist ladder + CTAs ─────────── */}
      <div className="grid gap-0 sm:grid-cols-[1fr_1px_1fr_1px_auto]">
        {/* Points economy */}
        <div className="px-4 py-3.5 sm:px-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            Point Economy
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-semibold">
            <span className="text-emerald-300">Win battle +10</span>
            <span className="text-amber-300">Correct pick +10</span>
            <span className="text-cyan-300">Clutch flip +25</span>
            <span className="text-white/40">Vote +3</span>
          </div>
          <p className="mt-2.5 text-[10px] text-white/30">
            Resets every Sunday midnight UTC. Season record carries forward.
          </p>
        </div>

        {/* Divider */}
        <div className="hidden bg-white/8 sm:block" />

        {/* Artist weekly ladder */}
        <div className="border-t border-white/8 px-4 py-3.5 sm:border-0 sm:px-5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-white/35">
            Artist Ladder{" "}
            <span className="font-normal text-white/22">this week</span>
          </p>
          {topArtists.length > 0 ? (
            <ol className="space-y-1">
              {topArtists.map((a, i) => (
                <li key={a.name} className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 shrink-0 text-center font-black text-white/25">
                    {i + 1}
                  </span>
                  <span className="truncate font-semibold text-white/75">{a.name}</span>
                  <span className="ml-auto shrink-0 font-black text-emerald-300">
                    {a.points}pt
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[11px] text-white/30">
              Season just started — first win takes the lead.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="hidden bg-white/8 sm:block" />

        {/* CTAs */}
        <div className="flex flex-col justify-center gap-2 border-t border-white/8 px-4 py-3.5 sm:border-0 sm:px-5">
          <Link
            href="/versus/season"
            className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-2 text-center text-[11px] font-black uppercase tracking-wider text-emerald-200 transition hover:bg-emerald-500/18"
          >
            Full Season Board
          </Link>
          <Link
            href="/versus"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-center text-[11px] font-black uppercase tracking-wider text-white/60 transition hover:bg-white/10"
          >
            {liveMatchCount}{" "}
            {liveMatchCount === 1 ? "battle" : "battles"} live →
          </Link>
        </div>
      </div>
    </div>
  );
}
