/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";

interface StemKind {
  vocals: string | null;
  drums: string | null;
  bass: string | null;
  other: string | null;
}

interface StemTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  genre: string | null;
  bpm: number | null;
  key: string | null;
  coverUrl: string | null;
  stems: StemKind;
}

interface Props {
  onLoadStem: (
    args: {
      sourceSongId: string;
      sourceTitle: string;
      sourceArtist: string;
      kind: keyof StemKind;
      url: string;
    },
  ) => Promise<void>;
}

const KIND_LABELS: Record<keyof StemKind, { label: string; color: string }> = {
  vocals: { label: "Vox", color: "text-pink-300" },
  drums: { label: "Drums", color: "text-cyan-300" },
  bass: { label: "Bass", color: "text-violet-300" },
  other: { label: "Other", color: "text-amber-300" },
};

/**
 * The economic flywheel made tactile. Every stem here is a draggable
 * loop — drop it on a track to record a StemUsage row that pays the
 * source artist 2% of your future track revenue.
 *
 * Sits in the DAW left rail behind a "Loops" tab.
 */
export default function StemLoopBrowser({ onLoadStem }: Props) {
  const [items, setItems] = useState<StemTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [bpmMin, setBpmMin] = useState<string>("");
  const [bpmMax, setBpmMax] = useState<string>("");
  const [recentLoad, setRecentLoad] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (bpmMin) params.set("bpmMin", bpmMin);
      if (bpmMax) params.set("bpmMax", bpmMax);
      params.set("limit", "30");
      const res = await fetch(`/api/stems/search?${params}`, { cache: "no-store" });
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items: StemTrack[] };
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, [q, bpmMin, bpmMax]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLoad = useCallback(
    async (track: StemTrack, kind: keyof StemKind) => {
      const url = track.stems[kind];
      if (!url) return;
      setRecentLoad(`${track.id}:${kind}`);
      await onLoadStem({
        sourceSongId: track.id,
        sourceTitle: track.title,
        sourceArtist: track.artist,
        kind,
        url,
      });
      // Fire-and-forget the usage record; royalty math reconciles later.
      void fetch("/api/stems/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceSongId: track.id,
          kind: kind.toUpperCase(),
        }),
      }).catch(() => {});
      setTimeout(() => setRecentLoad(null), 1500);
    },
    [onLoadStem],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/85">
            Loop Browser
          </p>
          <p className="mt-0.5 text-[11px] text-white/45">
            Every loop pays the original artist 2% of your future revenue.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_70px_70px] gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tracks, artists, genres"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none"
        />
        <input
          value={bpmMin}
          onChange={(e) => setBpmMin(e.target.value)}
          placeholder="BPM ≥"
          inputMode="numeric"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none"
        />
        <input
          value={bpmMax}
          onChange={(e) => setBpmMax(e.target.value)}
          placeholder="BPM ≤"
          inputMode="numeric"
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none"
        />
      </div>

      <div className="mt-3 grid max-h-[460px] gap-2 overflow-y-auto pr-1">
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/45">Loading loops…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/45">
            No matching tracks have stems yet. Be the first — publish a track
            with stems to seed the library.
          </p>
        ) : (
          items.map((track) => (
            <div
              key={track.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3 transition hover:border-brand-500/30"
            >
              <div className="flex items-center gap-3">
                {track.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.coverUrl}
                    alt=""
                    className="h-12 w-12 flex-shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-md border border-white/10 bg-white/5 text-lg">
                    🎵
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {track.title}
                  </p>
                  <p className="truncate text-xs text-white/55">
                    {track.artist}
                    {track.bpm ? ` · ${track.bpm} BPM` : ""}
                    {track.key ? ` · ${track.key}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(Object.keys(KIND_LABELS) as Array<keyof StemKind>).map((k) => {
                  const url = track.stems[k];
                  const isRecent = recentLoad === `${track.id}:${k}`;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => void handleLoad(track, k)}
                      disabled={!url}
                      className={`rounded-md border px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${
                        url
                          ? `border-white/15 bg-white/[0.04] hover:border-brand-500/40 hover:bg-brand-500/10 ${KIND_LABELS[k].color}`
                          : "border-white/5 bg-transparent text-white/15 cursor-not-allowed"
                      } ${isRecent ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : ""}`}
                      title={
                        url
                          ? `Load ${KIND_LABELS[k].label} stem into the next track`
                          : "stem unavailable"
                      }
                    >
                      {isRecent ? "✓" : KIND_LABELS[k].label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
