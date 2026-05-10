export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Command center */}
      <div className="mb-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 h-3 w-28 animate-pulse rounded bg-white/6" />
            <div className="h-12 w-full max-w-[520px] animate-pulse rounded-xl bg-white/8" />
            <div className="mt-3 h-4 w-full max-w-[620px] animate-pulse rounded bg-white/6" />
            <div className="mt-5 flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[54px] w-[136px] animate-pulse rounded-xl bg-white/6" />
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[380px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-white/6" />
              <div className="mt-3 h-5 w-36 animate-pulse rounded bg-white/8" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-white/6" />
            </div>
            <div className="grid gap-2">
              <div className="h-12 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
              <div className="h-12 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
              <div className="h-12 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-4 ${
                i === 0 ? "border-brand-500/35 bg-brand-500/10" : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <div className="h-3 w-24 animate-pulse rounded bg-white/6" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/6" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-white/6" />
            </div>
          ))}
        </div>
      </div>
      {/* Stat cards */}
      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/8 studio-faceplate p-5"
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
      <div className="rounded-2xl border border-white/8 studio-faceplate overflow-hidden">
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
