"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to your error tracking service here
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <svg
          aria-hidden="true"
          className="h-8 w-8 text-red-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <h1 className="text-3xl font-extrabold md:text-4xl">
        Something went wrong.
      </h1>
      <p className="mt-4 max-w-md text-base leading-7 text-white/50">
        An unexpected error occurred. We&apos;ve been notified and are looking
        into it.
        {error.digest && (
          <span className="mt-2 block font-mono text-xs text-white/25">
            Error ID: {error.digest}
          </span>
        )}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/16 px-6 text-sm font-bold text-white/70 transition hover:border-white/32 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
