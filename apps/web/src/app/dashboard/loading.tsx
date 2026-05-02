export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Header */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/6" />
          <div className="h-9 w-64 animate-pulse rounded-lg bg-white/8" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-xl bg-white/6" />
      </div>
      {/* Stat cards */}
      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/8 bg-[#141414] p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="h-3 w-24 animate-pulse rounded bg-white/6" />
              <div className="h-6 w-6 animate-pulse rounded bg-white/6" />
            </div>
            <div className="h-8 w-20 animate-pulse rounded bg-white/8" />
          </div>
        ))}
      </div>
      {/* Table skeleton */}
      <div className="rounded-2xl border border-white/8 bg-[#141414] overflow-hidden">
        <div className="border-b border-white/8 bg-white/[0.02] px-5 py-3.5 flex gap-10">
          {["Song", "License #", "Price", "Status", "Date"].map((h) => (
            <div key={h} className="h-3 w-16 animate-pulse rounded bg-white/6" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-10 border-b border-white/5 px-5 py-4"
          >
            <div className="h-4 w-28 animate-pulse rounded bg-white/6" />
            <div className="h-4 w-12 animate-pulse rounded bg-white/6" />
            <div className="h-4 w-14 animate-pulse rounded bg-white/6" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-white/6" />
            <div className="h-3 w-20 animate-pulse rounded bg-white/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
