export default function FeedLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      {/* Composer skeleton */}
      <div className="glass rounded-2xl p-4">
        <div className="h-20 animate-pulse rounded-xl bg-white/5" />
        <div className="mt-3 flex justify-between">
          <div className="flex gap-2">
            <div className="h-7 w-16 animate-pulse rounded-lg bg-white/5" />
            <div className="h-7 w-16 animate-pulse rounded-lg bg-white/5" />
            <div className="h-7 w-16 animate-pulse rounded-lg bg-white/5" />
          </div>
          <div className="h-9 w-20 animate-pulse rounded-xl bg-white/8" />
        </div>
      </div>

      {/* Tab toggles */}
      <div className="flex gap-2">
        <div className="h-8 w-20 animate-pulse rounded-full bg-white/8" />
        <div className="h-8 w-24 animate-pulse rounded-full bg-white/5" />
      </div>

      {/* Post card skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <article key={i} className="glass rounded-2xl p-4">
          <header className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-white/8" />
            <div className="flex-1">
              <div className="h-3 w-32 animate-pulse rounded bg-white/8" />
              <div className="mt-1 h-2 w-20 animate-pulse rounded bg-white/5" />
            </div>
          </header>
          <div className="mt-3 space-y-2">
            <div className="h-3 animate-pulse rounded bg-white/6" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-white/6" />
          </div>
          <div className="mt-3 h-48 animate-pulse rounded-xl bg-white/5" />
          <div className="mt-3 flex items-center gap-4">
            <div className="h-6 w-12 animate-pulse rounded-lg bg-white/5" />
            <div className="h-6 w-12 animate-pulse rounded-lg bg-white/5" />
            <div className="ml-auto h-6 w-16 animate-pulse rounded-lg bg-white/5" />
          </div>
        </article>
      ))}
    </div>
  );
}
