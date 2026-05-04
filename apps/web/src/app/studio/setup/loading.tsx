export default function StudioSetupLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <div className="mb-2 h-3 w-16 animate-pulse rounded-full bg-white/10" />
        <div className="h-9 w-56 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded-lg bg-white/6" />
      </div>
      <div className="space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card h-32 animate-pulse rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
