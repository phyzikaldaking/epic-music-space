"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/contexts/PlayerContext";

interface SongResult {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  coverUrl: string | null;
  streamUrl: string;
  licensePrice: number;
  bpm: number | null;
  key: string | null;
}

interface ArtistResult {
  username: string;
  level: number;
  bio: string | null;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    role: string;
    connectChargesEnabled: boolean;
    connectPayoutsEnabled: boolean;
    _count: { followers: number; songs: number };
  };
}

interface SearchResponse {
  songs: SongResult[];
  artists: ArtistResult[];
  nextCursor: string | null;
}

const GENRES = ["Hip-Hop", "Trap", "R&B", "Pop", "Drill", "Afrobeats", "Cinematic", "Lo-Fi", "Rock", "Electronic"];
const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: Low" },
  { value: "price-high", label: "Price: High" },
] as const;

export default function SearchClient({
  initialPromise,
}: {
  initialPromise: Promise<{ q?: string }>;
}) {
  const initial = use(initialPromise);
  const router = useRouter();
  const player = usePlayer();
  const [q, setQ] = useState(initial.q ?? "");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const trimmedQuery = useMemo(() => q.trim(), [q]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [genre, setGenre] = useState("");
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState("relevance");

  const hasFilters = !!(genre || bpmMin || bpmMax || musicalKey || priceMax);

  const buildUrl = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams();
      if (trimmedQuery) params.set("q", trimmedQuery);
      params.set("limit", "20");
      if (genre) params.set("genre", genre);
      if (bpmMin) params.set("bpmMin", bpmMin);
      if (bpmMax) params.set("bpmMax", bpmMax);
      if (musicalKey) params.set("key", musicalKey);
      if (priceMax) params.set("priceMax", priceMax);
      if (sort !== "relevance") params.set("sort", sort);
      if (cursor) params.set("cursor", cursor);
      return `/api/search?${params.toString()}`;
    },
    [trimmedQuery, genre, bpmMin, bpmMax, musicalKey, priceMax, sort],
  );

  useEffect(() => {
    if (!trimmedQuery && !hasFilters) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(buildUrl());
        if (!res.ok) throw new Error();
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults({ songs: [], artists: [], nextCursor: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmedQuery, buildUrl, hasFilters]);

  async function loadMore() {
    if (!results?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(results.nextCursor));
      if (!res.ok) throw new Error();
      const data = (await res.json()) as SearchResponse;
      setResults((prev) =>
        prev
          ? { songs: [...prev.songs, ...data.songs], artists: prev.artists, nextCursor: data.nextCursor }
          : data,
      );
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }

  function clearFilters() {
    setGenre("");
    setBpmMin("");
    setBpmMax("");
    setMusicalKey("");
    setPriceMax("");
    setSort("relevance");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.replace(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  }

  const activeFilterCount = [genre, bpmMin || bpmMax, musicalKey, priceMax].filter(Boolean).length;

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex gap-2">
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tracks, artists, genres..."
            className="flex-1 rounded-2xl border border-white/10 bg-white/4 px-5 py-3 text-base text-white placeholder-white/30 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              showFilters || hasFilters
                ? "border-brand-500/40 bg-brand-500/15 text-brand-300"
                : "border-white/10 bg-white/4 text-white/50 hover:text-white"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
            Filters{activeFilterCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
          </button>
        </div>
      </form>

      {/* Filter panel */}
      {showFilters && (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-widest text-white/40">Filter tracks</p>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="text-xs text-brand-400 hover:underline">
                Clear all
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Genre */}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-white/30">Genre</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-brand-500/60 focus:outline-none"
              >
                <option value="">Any genre</option>
                {GENRES.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* BPM range */}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-white/30">BPM range</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="20"
                  max="300"
                  placeholder="Min"
                  value={bpmMin}
                  onChange={(e) => setBpmMin(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-brand-500/60 focus:outline-none"
                />
                <input
                  type="number"
                  min="20"
                  max="300"
                  placeholder="Max"
                  value={bpmMax}
                  onChange={(e) => setBpmMax(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-brand-500/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Key */}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-white/30">Musical key</label>
              <input
                type="text"
                placeholder="e.g. C minor"
                value={musicalKey}
                onChange={(e) => setMusicalKey(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-brand-500/60 focus:outline-none"
              />
            </div>

            {/* Price */}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-white/30">Max price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Any"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-7 pr-3 py-2 text-sm text-white placeholder-white/20 focus:border-brand-500/60 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Sort */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Sort:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSort(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  sort === opt.value
                    ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!trimmedQuery && !hasFilters && (
        <div className="rounded-2xl border border-white/8 bg-[#141414] p-6 text-sm text-white/55">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 font-semibold text-white/85">Search anything on EMS</p>
              <p className="max-w-2xl text-xs leading-6">
                Tracks, artists, and genres. Use filters to narrow by BPM, key, or price. Try{" "}
                <button type="button" onClick={() => setQ("hip hop")} className="text-brand-400 hover:underline">hip hop</button>,{" "}
                <button type="button" onClick={() => setQ("trap")} className="text-brand-400 hover:underline">trap</button>, or{" "}
                <button type="button" onClick={() => setQ("ambient")} className="text-brand-400 hover:underline">ambient</button>.
              </p>
            </div>
            <Link
              href="/marketplace"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-cyan-200"
            >
              Browse marketplace
            </Link>
          </div>
        </div>
      )}

      {(trimmedQuery || hasFilters) && loading && results === null && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 animate-pulse">
              <div className="h-12 w-12 rounded-lg bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-white/10" />
                <div className="h-2 w-48 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {results && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/50">
              Tracks ({results.songs.length}{results.nextCursor ? "+" : ""})
            </h2>
            {results.songs.length === 0 ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.02] p-5 text-sm text-white/55">
                <p>No tracks match your search{hasFilters ? " with those filters" : ""}.</p>
                <p className="mt-1 text-xs text-white/35">
                  {hasFilters ? (
                    <button type="button" onClick={clearFilters} className="text-brand-400 hover:underline">
                      Clear filters
                    </button>
                  ) : (
                    <>Try a shorter keyword, a genre, or browse the{" "}
                    <Link href="/marketplace" className="text-brand-400 hover:underline">marketplace</Link>.</>
                  )}
                </p>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {results.songs.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 hover:bg-white/6 transition"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          player.playSong({
                            id: s.id,
                            title: s.title,
                            artist: s.artist,
                            audioUrl: s.streamUrl,
                            coverUrl: s.coverUrl,
                          })
                        }
                        aria-label={`Play ${s.title}`}
                        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-brand-900 hover:opacity-90 group"
                      >
                        {s.coverUrl ? (
                          <Image src={s.coverUrl} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-900 to-accent-900">
                            <svg className="h-5 w-5 text-white/30" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" /></svg>
                          </div>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                          <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </button>
                      <Link href={`/track/${s.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{s.title}</p>
                        <p className="truncate text-xs text-white/45">
                          {s.artist}
                          {s.genre ? ` · ${s.genre}` : ""}
                          {s.bpm ? ` · ${s.bpm} BPM` : ""}
                          {s.key ? ` · ${s.key}` : ""}
                        </p>
                      </Link>
                      <span className="text-sm font-bold text-brand-300 shrink-0">
                        ${s.licensePrice.toFixed(0)}
                      </span>
                    </li>
                  ))}
                </ul>
                {results.nextCursor && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-4 w-full rounded-xl border border-white/10 bg-white/4 py-2.5 text-sm font-semibold text-white/50 hover:bg-white/8 disabled:opacity-50 transition"
                  >
                    {loadingMore ? "Loading..." : "Load more tracks"}
                  </button>
                )}
              </>
            )}
          </section>

          {results.artists.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/50">
                Artists ({results.artists.length})
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.artists.map((a) => (
                  <li key={a.username}>
                    <Link
                      href={`/studio/${a.username}`}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 hover:bg-white/6 transition"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500 flex items-center justify-center text-base">
                        {a.user.image ? (
                          <Image src={a.user.image} alt="" width={48} height={48} className="h-full w-full object-cover" />
                        ) : (
                          <svg className="h-5 w-5 text-white/50" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">
                          {a.user.name ?? a.username}
                          {a.user.connectChargesEnabled && a.user.connectPayoutsEnabled && (
                            <span className="ml-1 text-sky-300" title="Verified artist">✓</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-white/45">
                          @{a.username} · {a.user._count.followers} followers · {a.user._count.songs} tracks
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
