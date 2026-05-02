export default function MarketplaceLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Header skeleton */}
      <div className="mb-8">
        <div className="mb-2 h-6 w-36 animate-pulse rounded-full bg-white/8" />
        <div className="h-10 w-48 animate-pulse rounded-lg bg-white/8" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/6" />
      </div>
      {/* Filter bar skeleton */}
      <div className="mb-8 flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-white/6" />
        <div className="h-10 w-40 animate-pulse rounded-lg bg-white/6" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-white/6" />
      </div>
      {/* Trending strip label */}
      <div className="mb-5 h-6 w-32 animate-pulse rounded bg-white/8" />
      {/* Card grid */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-white/8 bg-[#141414]"
          >
            <div className="aspect-square w-full animate-pulse bg-white/6" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/8" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-white/6" />
              <div className="flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-white/6" />
                <div className="h-5 w-14 animate-pulse rounded-full bg-white/6" />
              </div>
              <div className="h-8 w-full animate-pulse rounded-lg bg-white/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
