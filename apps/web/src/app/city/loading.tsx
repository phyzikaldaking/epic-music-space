export default function Loading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-sm text-white/40">Loading city…</p>
      </div>
    </div>
  );
}
