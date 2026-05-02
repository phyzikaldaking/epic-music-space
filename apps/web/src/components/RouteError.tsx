"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <svg aria-hidden="true" className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <h2 className="text-2xl font-extrabold">Something went wrong.</h2>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-white/25">Error ID: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button onClick={reset} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-600">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-white/16 px-5 py-2 text-sm font-bold text-white/70 transition hover:text-white">
          Go Home
        </Link>
      </div>
    </div>
  );
}
