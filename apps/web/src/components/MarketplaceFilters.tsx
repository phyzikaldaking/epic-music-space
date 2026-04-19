"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const SORT_OPTIONS = [
  { value: "trending",   label: "🔥 Trending" },
  { value: "newest",     label: "🆕 Newest" },
  { value: "price_asc",  label: "💰 Price: Low → High" },
  { value: "price_desc", label: "💰 Price: High → Low" },
  { value: "rev_desc",   label: "📈 Revenue Share" },
];

const GENRE_OPTIONS = [
  "Hip-Hop", "Trap", "R&B", "Pop", "Electronic", "House", "Drill",
  "Afrobeats", "Jazz", "Lo-Fi", "Rock", "Classical", "Reggaeton",
];

interface Props {
  totalCount: number;
}

export default function MarketplaceFilters({ totalCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const genre  = searchParams.get("genre")  ?? "";
  const sort   = searchParams.get("sort")   ?? "trending";

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const hasFilters = search || genre || sort !== "trending";

  return (
    <div className="mb-8 space-y-4">
      {/* Search + sort row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Search input */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            placeholder="Search songs or artists…"
            value={search}
            onChange={(e) => update("search", e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/4 py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
          className="rounded-xl border border-white/10 bg-[#141414] px-4 py-2.5 text-sm text-white/70 transition focus:border-brand-500/60 focus:outline-none sm:w-52"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Genre pills */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => update("genre", "")}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            !genre
              ? "bg-brand-500 text-white"
              : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
          }`}
        >
          All genres
        </button>
        {GENRE_OPTIONS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => update("genre", genre === g ? "" : g)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              genre === g
                ? "bg-brand-500 text-white"
                : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Results count + clear */}
      <div className="flex items-center justify-between text-xs text-white/35">
        <span>
          {totalCount} {totalCount === 1 ? "song" : "songs"} found
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="text-brand-400 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
