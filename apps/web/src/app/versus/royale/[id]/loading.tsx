export default function VersusRoyaleLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 h-8 w-56 animate-pulse rounded-lg bg-white/8" />
      <div className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/8 bg-[#141414] p-6">
            <div className="mb-4 h-32 animate-pulse rounded-xl bg-white/6" />
            <div className="mb-2 h-5 w-2/3 animate-pulse rounded bg-white/8" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-white/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
