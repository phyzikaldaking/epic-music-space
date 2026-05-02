"use client";

import { useEffect, useState } from "react";
import { CHANNELS, createBrowserSupabaseClient } from "@/lib/supabase";

type Winner = {
  songId: string;
  title: string;
  artist: string;
  winningBoostScore: number;
  winningRankScore: number;
};

export default function AuctionWinnerTakeover() {
  const [winner, setWinner] = useState<Winner | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase.channel(CHANNELS.leaderboard);
    channel.on("broadcast", { event: "auction_cycle_reset" }, ({ payload }) => {
      const nextWinner = payload?.winner as Winner | null | undefined;
      setWinner(nextWinner ?? null);
      setCycleId(typeof payload?.cycleId === "string" ? payload.cycleId : null);
      window.setTimeout(() => setWinner(null), 12000);
    });
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (!winner) return null;

  return (
    <div className="fixed inset-x-4 top-6 z-[90] mx-auto max-w-4xl rounded-3xl border border-gold-300/30 bg-black/90 p-5 text-center shadow-2xl shadow-black/70 backdrop-blur">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-gold-200">Auction Champion</p>
      <h2 className="mt-2 text-3xl font-black text-white">👑 {winner.title}</h2>
      <p className="mt-1 text-sm font-bold text-white/55">by {winner.artist}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-bold text-white/70">
        <span className="rounded-full bg-gold-300/10 px-3 py-1.5 text-gold-100">Bid power {winner.winningBoostScore.toFixed(0)}</span>
        <span className="rounded-full bg-accent-300/10 px-3 py-1.5 text-accent-100">Rank {winner.winningRankScore.toFixed(1)}</span>
        {cycleId && <span className="rounded-full bg-white/10 px-3 py-1.5">{cycleId}</span>}
      </div>
      <button type="button" onClick={() => setWinner(null)} className="mt-4 rounded-full bg-white px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-black">
        Enter New Cycle
      </button>
    </div>
  );
}
