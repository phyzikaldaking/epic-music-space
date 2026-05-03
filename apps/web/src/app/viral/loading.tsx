export default function ViralLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-8 h-9 w-48 animate-pulse rounded-lg bg-white/8" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#141414] p-5">
            <div className="mb-3 h-40 animate-pulse rounded-xl bg-white/6" />
            <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-white/8" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
