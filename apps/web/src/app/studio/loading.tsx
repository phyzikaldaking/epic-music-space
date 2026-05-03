export default function StudioLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        <div className="h-4 w-32 animate-pulse rounded bg-white/6" />
      </div>
    </div>
  );
}
