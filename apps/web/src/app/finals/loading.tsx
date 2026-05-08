export default function FinalsLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 h-9 w-36 animate-pulse rounded-lg bg-white/8" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-white/8 studio-faceplate p-6">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 animate-pulse rounded-full bg-white/8" />
              <div className="flex-1">
                <div className="mb-2 h-5 w-1/2 animate-pulse rounded bg-white/8" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-white/6" />
              </div>
              <div className="h-8 w-20 animate-pulse rounded-lg bg-white/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
