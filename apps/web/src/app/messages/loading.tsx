export default function MessagesLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-1 h-8 w-32 animate-pulse rounded-lg bg-white/8" />
      <div className="mb-6 h-3 w-72 animate-pulse rounded bg-white/5" />

      <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-11 w-11 flex-shrink-0 animate-pulse rounded-full bg-white/8" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-40 animate-pulse rounded bg-white/8" />
              <div className="h-2 w-56 animate-pulse rounded bg-white/5" />
            </div>
            <div className="h-2 w-8 animate-pulse rounded bg-white/5" />
          </li>
        ))}
      </ul>
    </div>
  );
}
