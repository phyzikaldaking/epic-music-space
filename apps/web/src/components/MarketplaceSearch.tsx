"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { useDeferredValue, useState } from "react";

export default function MarketplaceSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);

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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    // Debounce via deferred value pattern
    if (val === deferred || val.length === 0 || val.length > 2) {
      updateSearch(val);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateSearch(query);
  }

  function handleClear() {
    setQuery("");
    updateSearch("");
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex-1 max-w-sm">
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <svg className="h-4 w-4 text-white/35" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </div>
      <input
        type="search"
        value={query}
        onChange={handleChange}
        placeholder="Search tracks, artists…"
        className="w-full rounded-xl border border-white/12 bg-white/6 py-2.5 pl-9 pr-8 text-sm text-white placeholder-white/30 outline-none transition focus:border-brand-500/50 focus:bg-white/8 focus:ring-1 focus:ring-brand-500/30"
        aria-label="Search marketplace"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute inset-y-0 right-3 flex items-center text-white/30 hover:text-white transition"
          aria-label="Clear search"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      )}
    </form>
  );
}
