export default function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/6" />
      <div className="mb-8 h-9 w-56 animate-pulse rounded-lg bg-white/8" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
