"use client";

import Link from "next/link";

export default function PostErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mb-3 text-4xl">⚠️</div>
      <h1 className="text-xl font-bold">Couldn&apos;t load this post</h1>
      <p className="mt-2 text-sm text-white/50">
        Something went wrong while fetching this post. It may have been removed.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold hover:bg-brand-600"
        >
          Try again
        </button>
        <Link
          href="/feed"
          className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
        >
          Back to feed
        </Link>
      </div>
    </div>
  );
}
