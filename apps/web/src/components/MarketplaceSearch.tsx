"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const QUICK_SEARCHES = [
  { label: "Trap", href: "/marketplace?genre=Trap" },
  { label: "R&B", href: "/marketplace?genre=R%26B" },
  { label: "Cinematic", href: "/marketplace?genre=Cinematic" },
];

export default function MarketplaceSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);

  const updateSearch = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      startTransition(() => {
        router.push(`/marketplace?${params.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const next = query.trim();
    if (next === initialQuery.trim()) return;
    if (next.length > 0 && next.length < 3) return;

    const id = window.setTimeout(() => updateSearch(next), 300);
    return () => window.clearTimeout(id);
  }, [initialQuery, query, updateSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateSearch(query);
  }

  function handleClear() {
    setQuery("");
    updateSearch("");
  }

  return (
    <div className="w-full flex-1 sm:max-w-md">
      <form onSubmit={handleSubmit} className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <svg className="h-4 w-4 text-white/35" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, artist, mood..."
          className="w-full rounded-xl border border-white/12 bg-white/6 py-2.5 pl-9 pr-20 text-sm text-white placeholder-white/30 outline-none transition focus:border-brand-500/50 focus:bg-white/8 focus:ring-1 focus:ring-brand-500/30"
          aria-label="Search marketplace"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/8 hover:text-white"
              aria-label="Clear search"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-cyan-200"
          >
            Go
          </button>
        </div>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_SEARCHES.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[11px] font-bold text-white/55 transition hover:border-cyan-200/35 hover:bg-cyan-200/10 hover:text-cyan-100"
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
