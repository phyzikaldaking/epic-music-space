"use client";

import { useEffect, useState } from "react";

// Owner-only card that fetches an AI-generated career tip from
// /api/ai/career-tip. Tips are cached server-side per-artist per-day
// so refresh just hits the cache. We render a small skeleton while
// the first request is in flight; failures are silent (no card) so
// the studio page never breaks on a transient AI outage.

type Phase = "loading" | "ready" | "error";

export default function CareerTipCard() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [tip, setTip] = useState<string>("");
  const [cached, setCached] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/ai/career-tip", {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setPhase("error");
          return;
        }
        const data = (await res.json()) as { tip?: string; cached?: boolean };
        if (cancelled) return;
        if (data.tip) {
          setTip(data.tip);
          setCached(Boolean(data.cached));
          setPhase("ready");
        } else {
          setPhase("error");
        }
      } catch {
        if (!cancelled) setPhase("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "error") return null;

  return (
    <section className="mt-6 rounded-2xl border border-violet-400/35 bg-gradient-to-br from-violet-500/[0.08] via-fuchsia-500/[0.05] to-violet-500/[0.08] p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/25 text-lg text-violet-100"
        >
          🧠
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-200">
              AI Career Tip
            </p>
            {cached && (
              <span
                title="Tips refresh daily — same insight all day to avoid whiplash."
                className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/45"
              >
                Today
              </span>
            )}
          </div>
          {phase === "loading" ? (
            <div className="mt-2 space-y-1.5">
              <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-white/90">{tip}</p>
          )}
        </div>
      </div>
    </section>
  );
}
