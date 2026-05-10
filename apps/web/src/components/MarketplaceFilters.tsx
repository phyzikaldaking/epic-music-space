"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rev_desc", label: "Revenue Share" },
];

const GENRE_OPTIONS = [
  "Cinematic",
  "Trailer",
  "Ambient",
  "Hip-Hop",
  "Trap",
  "R&B",
  "Pop",
  "Electronic",
  "House",
  "Drill",
  "Afrobeats",
  "Jazz",
  "Lo-Fi",
  "Rock",
  "Classical",
  "Reggaeton",
];

const TEMPO_OPTIONS = [
  { value: "", label: "Any tempo" },
  { value: "slow", label: "Under 90 BPM" },
  { value: "mid", label: "90-130 BPM" },
  { value: "fast", label: "130+ BPM" },
];

const BUDGET_OPTIONS = [
  { value: "", label: "Any budget" },
  { value: "under_50", label: "Under $50" },
  { value: "50_150", label: "$50-$150" },
  { value: "150_500", label: "$150-$500" },
  { value: "500_plus", label: "$500+" },
];

const KEY_OPTIONS = ["", "C minor", "D minor", "E minor", "F minor", "G minor", "A minor", "C major", "D major", "G major"];

const MOOD_OPTIONS = [
  { value: "", label: "Any mood" },
  { value: "cinematic", label: "Cinematic" },
  { value: "dark", label: "Dark" },
  { value: "bright", label: "Bright" },
  { value: "club", label: "Club" },
  { value: "lofi", label: "Lo-Fi" },
];

const RIGHTS_OPTIONS = [
  { value: "", label: "Any rights" },
  { value: "social", label: "Social + Ads" },
  { value: "broadcast", label: "Broadcast-ready" },
  { value: "exclusive", label: "Exclusive-style scarcity" },
];

const SCARCITY_OPTIONS = [
  { value: "", label: "Any supply" },
  { value: "low", label: "Almost gone" },
  { value: "medium", label: "Limited" },
  { value: "open", label: "Open supply" },
];

// Producer-role filter — lets buyers find tracks uploaded by users of a
// specific role (producers, engineers, labels) without needing to know
// which artist is which. Empty value = no filter.
const ROLE_OPTIONS = [
  { value: "", label: "All creators" },
  { value: "PRODUCER", label: "Producers" },
  { value: "ENGINEER", label: "Engineers" },
  { value: "ARTIST", label: "Artists" },
  { value: "LABEL", label: "Labels" },
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
  const tempo  = searchParams.get("tempo")  ?? "";
  const role   = searchParams.get("role")   ?? "";
  const budget = searchParams.get("budget") ?? "";
  const musicalKey = searchParams.get("key") ?? "";
  const mood = searchParams.get("mood") ?? "";
  const rights = searchParams.get("rights") ?? "";
  const scarcity = searchParams.get("scarcity") ?? "";

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

  const hasFilters = search || genre || tempo || role || budget || musicalKey || mood || rights || scarcity || sort !== "trending";

  return (
    <div className="mb-10 border-y border-white/10 py-5">
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
            className="h-11 w-full rounded-md border border-white/10 bg-white/[0.035] py-2.5 pl-9 pr-4 text-sm text-white placeholder-white/25 transition focus:border-accent-400/60 focus:outline-none focus:ring-1 focus:ring-accent-400/40"
          />
        </div>

        {/* Sort dropdown */}
        <select
          aria-label="Sort marketplace tracks"
          title="Sort marketplace tracks"
          value={sort}
          onChange={(e) => update("sort", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none sm:w-56"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Genre pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => update("genre", "")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            !genre
              ? "bg-white text-[#050509]"
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
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              genre === g
                ? "bg-white text-[#050509]"
                : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Role segmented filter — lets buyers find tracks from producers,
          engineers, labels without scanning artist names. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-white/35">
          Creator
        </span>
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value || "any-role"}
            type="button"
            onClick={() => update("role", option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              role === option.value
                ? "bg-brand-500 text-white"
                : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Tempo segmented filter */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-white/35">
          Tempo
        </span>
        {TEMPO_OPTIONS.map((option) => (
          <button
            key={option.value || "any-tempo"}
            type="button"
            onClick={() => update("tempo", option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              tempo === option.value
                ? "bg-accent-500 text-[#081013]"
                : "border border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <select
          aria-label="Budget range"
          title="Budget range"
          value={budget}
          onChange={(e) => update("budget", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none"
        >
          {BUDGET_OPTIONS.map((o) => (
            <option key={o.value || "any-budget"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          aria-label="Musical key"
          title="Musical key"
          value={musicalKey}
          onChange={(e) => update("key", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none"
        >
          {KEY_OPTIONS.map((key) => (
            <option key={key || "any-key"} value={key}>{key || "Any key"}</option>
          ))}
        </select>
        <select
          aria-label="Mood"
          title="Mood"
          value={mood}
          onChange={(e) => update("mood", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none"
        >
          {MOOD_OPTIONS.map((o) => (
            <option key={o.value || "any-mood"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          aria-label="Rights scope"
          title="Rights scope"
          value={rights}
          onChange={(e) => update("rights", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none"
        >
          {RIGHTS_OPTIONS.map((o) => (
            <option key={o.value || "any-rights"} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          aria-label="Scarcity"
          title="Scarcity"
          value={scarcity}
          onChange={(e) => update("scarcity", e.target.value)}
          className="h-11 rounded-md border border-white/10 bg-[#0a0b10] px-4 py-2.5 text-sm text-white/70 transition focus:border-accent-400/60 focus:outline-none sm:col-span-2"
        >
          {SCARCITY_OPTIONS.map((o) => (
            <option key={o.value || "any-scarcity"} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Results count + clear */}
      <div className="mt-4 flex items-center justify-between text-xs text-white/35">
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
