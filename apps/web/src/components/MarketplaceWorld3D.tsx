"use client";

import { useMemo } from "react";

type Item = { id: string; title?: string | null };

type MarketplaceWorld3DProps = {
  items: Item[];
};

const GENRES = ["Beats", "Hooks", "Trap", "R&B", "Pop", "Drill", "Afrobeats", "Cinematic", "Sync", "Other"];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function stableCoord(value: number): number {
  return Number(value.toFixed(6));
}

function TrackOrb({ item, index, total }: { item: Item; index: number; total: number }) {
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI;
  const radius = total <= 6 ? 36 : total <= 12 ? 38 : 40;
  const cx = stableCoord(50 + radius * Math.cos(angle));
  const cy = stableCoord(50 + radius * Math.sin(angle));
  const seed = hashString(item.id);
  const hue = (seed % 360);
  const size = 1.5 + (seed % 20) / 10;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={size}
      fill={`hsl(${hue},80%,65%)`}
      opacity={0.75}
    >
      <title>{item.title ?? item.id}</title>
    </circle>
  );
}

export default function MarketplaceWorld3D({ items }: MarketplaceWorld3DProps) {
  const genreBuckets = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const g of GENRES) buckets[g] = 0;
    for (const item of items) {
      const g = GENRES[hashString(item.id) % GENRES.length];
      buckets[g] = (buckets[g] ?? 0) + 1;
    }
    return Object.entries(buckets)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [items]);

  const topGenre = genreBuckets[0];
  const displayItems = items.slice(0, 48);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-fuchsia-500/10 to-amber-300/10 p-6"
      aria-label="Marketplace world overview"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.15),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(217,70,239,.18),transparent_35%)]" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Marketplace World</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Live district pulse</h2>
          <p className="mt-1 text-sm text-white/70">
            {items.length} active track{items.length !== 1 ? "s" : ""} across {genreBuckets.length} genre{genreBuckets.length !== 1 ? "s" : ""}
          </p>
          {topGenre && (
            <p className="mt-1 text-xs text-white/40">
              Top genre: <span className="text-cyan-300">{topGenre[0]}</span> &mdash; {topGenre[1]} track{topGenre[1] !== 1 ? "s" : ""}
            </p>
          )}

          {genreBuckets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {genreBuckets.slice(0, 8).map(([genre, count]) => {
                const pct = Math.round((count / items.length) * 100);
                return (
                  <span
                    key={genre}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-white/60"
                  >
                    {genre} <span className="text-cyan-300/80">{pct}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {displayItems.length > 0 && (
          <div className="shrink-0 self-center sm:self-start">
            <svg
              viewBox="0 0 100 100"
              className="h-[120px] w-[120px] sm:h-[140px] sm:w-[140px]"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="2.5" fill="rgba(34,211,238,0.6)" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              {displayItems.map((item, i) => (
                <TrackOrb key={item.id} item={item} index={i} total={displayItems.length} />
              ))}
            </svg>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <p className="mt-4 text-xs text-white/30">No active listings yet.</p>
      )}
    </section>
  );
}
