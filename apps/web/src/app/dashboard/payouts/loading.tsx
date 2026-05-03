export default function PayoutsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 h-9 w-32 animate-pulse rounded-lg bg-white/8" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#141414] p-5">
            <div className="mb-2 h-3 w-20 animate-pulse rounded bg-white/6" />
            <div className="h-8 w-28 animate-pulse rounded-lg bg-white/8" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/8 bg-[#141414] p-6">
        <div className="mb-4 h-6 w-36 animate-pulse rounded bg-white/8" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl bg-white/4 px-4 py-3">
              <div className="h-4 w-40 animate-pulse rounded bg-white/8" />
              <div className="h-4 w-20 animate-pulse rounded bg-white/6" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
