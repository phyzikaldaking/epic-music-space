"use client";

import { useEffect, useState } from "react";

type AuctionCycle = {
  cycleId: string;
  startsAt: string;
  endsAt: string;
  msRemaining: number;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export default function AuctionCycleCountdown({ compact = false }: { compact?: boolean }) {
  const [cycle, setCycle] = useState<AuctionCycle | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function loadCycle() {
      const response = await fetch("/api/auction-cycle", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as AuctionCycle;
      if (!mounted) return;
      setCycle(data);
      setRemaining(new Date(data.endsAt).getTime() - Date.now());
    }
    void loadCycle();
    const sync = window.setInterval(loadCycle, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(sync);
    };
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (!cycle) return;
      const next = new Date(cycle.endsAt).getTime() - Date.now();
      setRemaining(next);
      if (next <= 0) void fetch("/api/auction-cycle/reset", { method: "POST" });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [cycle]);

  if (compact) {
    return (
      <span className="rounded-full border border-gold-300/30 bg-gold-300/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-gold-100">
        Cycle ends {formatDuration(remaining)}
      </span>
    );
  }

  return (
    <section className="rounded-[2rem] border border-gold-300/20 bg-[radial-gradient(circle_at_15%_20%,rgba(251,191,36,.18),transparent_32%),rgba(0,0,0,.42)] p-5 shadow-2xl shadow-black/40">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-gold-200">Auction cycle</p>
          <h2 className="mt-1 text-2xl font-black text-white">Win this wall before the round resets.</h2>
          <p className="mt-2 text-sm text-white/50">At reset, bid power clears and the next 24-hour competition starts fresh.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/60 px-5 py-4 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Time remaining</p>
          <p className="mt-1 font-mono text-3xl font-black text-gold-100">{formatDuration(remaining)}</p>
          <p className="mt-1 text-[11px] text-white/35">{cycle?.cycleId ?? "loading cycle"}</p>
        </div>
      </div>
    </section>
  );
}
