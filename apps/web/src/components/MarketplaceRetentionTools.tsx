"use client";

import { useEffect, useMemo, useState } from "react";

type TrackSeed = {
  id: string;
  title: string;
};

type SavedSearch = {
  id: string;
  name: string;
  mood: string;
  budget: string;
  licenseType: string;
};

type Props = {
  tracks: TrackSeed[];
};

const STORAGE_SAVED_SEARCHES = "ems.saved-searches.v1";
const STORAGE_WATCHLIST = "ems.watchlist.v1";

export default function MarketplaceRetentionTools({ tracks }: Props) {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [alertsEnabled, setAlertsEnabled] = useState(false);

  const watchlistOptions = useMemo(() => tracks.slice(0, 20), [tracks]);

  useEffect(() => {
    try {
      const rawSearches = localStorage.getItem(STORAGE_SAVED_SEARCHES);
      const rawWatch = localStorage.getItem(STORAGE_WATCHLIST);
      if (rawSearches) setSavedSearches(JSON.parse(rawSearches) as SavedSearch[]);
      if (rawWatch) setWatchlist(JSON.parse(rawWatch) as string[]);
    } catch {
      // ignore hydration/storage parse failures
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_SAVED_SEARCHES, JSON.stringify(savedSearches));
  }, [savedSearches]);

  useEffect(() => {
    localStorage.setItem(STORAGE_WATCHLIST, JSON.stringify(watchlist));
  }, [watchlist]);

  function addStarterSearch() {
    const stamp = Date.now();
    const item: SavedSearch = {
      id: String(stamp),
      name: `Trailer cinematic ${savedSearches.length + 1}`,
      mood: "Cinematic",
      budget: "$100-$300",
      licenseType: "Social + Ads",
    };
    setSavedSearches((prev) => [item, ...prev].slice(0, 8));
  }

  async function enableAlerts() {
    try {
      const permission = await Notification.requestPermission();
      setAlertsEnabled(permission === "granted");
    } catch {
      setAlertsEnabled(false);
    }
  }

  function toggleWatch(songId: string) {
    setWatchlist((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId].slice(0, 20),
    );
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Return behavior</p>
            <h3 className="mt-1 text-xl font-bold text-white">Saved searches</h3>
          </div>
          <button
            type="button"
            onClick={addStarterSearch}
            className="rounded-lg border border-brand-500/35 bg-brand-500/15 px-3 py-2 text-xs font-semibold text-brand-100 hover:bg-brand-500/25"
          >
            Save current filters
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {savedSearches.length === 0 ? (
            <p className="text-sm text-white/55">No saved searches yet. Save one-click presets to return faster.</p>
          ) : (
            savedSearches.map((search) => (
              <div key={search.id} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white/80">
                <p className="font-semibold text-white">{search.name}</p>
                <p className="text-xs text-white/55">{search.mood} • {search.budget} • {search.licenseType}</p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Retention</p>
            <h3 className="mt-1 text-xl font-bold text-white">Watchlist + alerts</h3>
          </div>
          <button
            type="button"
            onClick={enableAlerts}
            className="rounded-lg border border-accent-500/35 bg-accent-500/15 px-3 py-2 text-xs font-semibold text-accent-100 hover:bg-accent-500/25"
          >
            {alertsEnabled ? "Alerts enabled" : "Enable alerts"}
          </button>
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
          {watchlistOptions.map((track) => {
            const active = watchlist.includes(track.id);
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => toggleWatch(track.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                  active
                    ? "border-accent-400/50 bg-accent-500/20 text-white"
                    : "border-white/10 bg-black/25 text-white/75 hover:bg-black/40"
                }`}
              >
                <span>{track.title}</span>
                <span className="text-xs">{active ? "Watching" : "Watch"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
