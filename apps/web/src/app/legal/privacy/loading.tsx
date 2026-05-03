export default function LegalLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-2 h-10 w-64 animate-pulse rounded bg-white/8" />
      <div className="mb-10 h-3 w-40 animate-pulse rounded bg-white/5" />
      <div className="space-y-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-white/8" />
            <div className="h-3 w-full animate-pulse rounded bg-white/5" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-white/5" />
            <div className="h-3 w-4/6 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
