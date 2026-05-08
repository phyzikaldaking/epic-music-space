export default function StudioLiveLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8 h-9 w-40 animate-pulse rounded-lg bg-white/8" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-white/8 studio-faceplate p-6">
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-white/8" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 rounded-xl bg-white/4 p-4">
                <div className="h-12 w-12 animate-pulse rounded-lg bg-white/8" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-white/8" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-white/6" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 studio-faceplate p-6">
          <div className="mb-4 h-6 w-24 animate-pulse rounded bg-white/8" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-white/6" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
