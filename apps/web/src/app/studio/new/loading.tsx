export default function StudioNewLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 h-9 w-52 animate-pulse rounded-lg bg-white/8" />
      <div className="rounded-2xl border border-white/8 studio-faceplate p-8">
        <div className="space-y-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/6" />
              <div className="h-11 animate-pulse rounded-xl bg-white/6" />
            </div>
          ))}
          <div className="h-11 animate-pulse rounded-xl bg-accent-400/20" />
        </div>
      </div>
    </div>
  );
}
