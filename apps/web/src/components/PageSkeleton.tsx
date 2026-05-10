export default function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 rounded-[28px] border border-white/10 bg-white/[0.035] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 h-3 w-24 animate-pulse rounded bg-white/6" />
            <div className="h-12 w-full max-w-[520px] animate-pulse rounded-xl bg-white/8" />
            <div className="mt-3 h-4 w-full max-w-[620px] animate-pulse rounded bg-white/6" />
            <div className="mt-5 flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[54px] w-[132px] animate-pulse rounded-xl bg-white/6" />
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
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/8 bg-white/5" />
        ))}
      </div>
    </div>
  );
}
