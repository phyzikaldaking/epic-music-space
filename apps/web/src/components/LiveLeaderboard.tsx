"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient, CHANNELS } from "@/lib/supabase";

interface LeaderboardEntry {
  id: string;
  title?: string;
  name?: string;
  artist?: string;
  coverUrl?: string | null;
  image?: string | null;
  aiScore?: number;
  soldLicenses?: number;
  totalLicensesSold?: number;
  followers?: number;
  district?: string;
  username?: string;
}

interface LiveLeaderboardProps {
  initialEntries: LeaderboardEntry[];
  type: "songs" | "artists";
  LeaderboardTableComponent: React.ComponentType<{ entries: LeaderboardEntry[]; type: "songs" | "artists" }>;
}

/**
 * LiveLeaderboard
 *
 * Wraps the static LeaderboardTable with a Supabase realtime subscription.
 * When a `scores_updated` event is received on the ems:leaderboard channel,
 * it re-fetches the leaderboard via the /api/leaderboard endpoint and
 * updates the displayed entries.
 */
export default function LiveLeaderboard({ initialEntries, type, LeaderboardTableComponent }: LiveLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/leaderboard?type=${type}&limit=50&_t=${Date.now()}`);
      if (res.ok) {
        const data = (await res.json()) as LeaderboardEntry[];
        setEntries(data);
        setLastUpdated(new Date());
      }
    } catch {
      // silently ignore — initial data is still shown
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(CHANNELS.leaderboard)
      .on("broadcast", { event: "scores_updated" }, () => {
        // Debounce rapid updates (e.g. many votes at once) — wait 1.5s then refresh once
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          void refresh();
        }, 1500);
      })
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  return (
    <div className="relative">
      {/* Live status indicator */}
      <div className="mb-3 flex items-center justify-between text-xs text-white/30">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500/70 animate-pulse" />
          Live
        </span>
        {lastUpdated && (
          <span>Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
        {refreshing && (
          <span className="text-brand-400/70">Refreshing…</span>
        )}
      </div>
      <LeaderboardTableComponent entries={entries} type={type} />
    </div>
  );
}
