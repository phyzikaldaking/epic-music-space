"use client";

export default function FeedErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mb-3 text-4xl">📡</div>
      <h1 className="text-xl font-bold">Couldn&apos;t load the feed</h1>
      <p className="mt-2 text-sm text-white/50">
        Network hiccup. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold hover:bg-brand-600"
      >
        Reload feed
      </button>
    </div>
  );
}
