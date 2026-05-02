export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-white/8" />
        <div className="mt-2 h-4 w-72 animate-pulse rounded bg-white/6" />
      </div>
      {/* Tabs */}
      <div className="mb-6 flex gap-3">
        <div className="h-9 w-24 animate-pulse rounded-xl bg-white/8" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-white/6" />
      </div>
      {/* Table rows */}
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
        <div className="border-b border-white/8 bg-white/[0.02] px-5 py-3.5 grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-white/6" />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-4 items-center border-b border-white/5 px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-pulse rounded bg-white/6" />
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/6" />
              <div className="h-4 w-28 animate-pulse rounded bg-white/6" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-white/6" />
            <div className="h-4 w-12 animate-pulse rounded bg-white/8" />
            <div className="h-3 w-10 animate-pulse rounded bg-white/6" />
            <div className="h-5 w-14 animate-pulse rounded-full bg-white/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
