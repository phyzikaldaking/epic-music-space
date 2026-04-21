import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      <div className="relative mb-6">
        <p className="text-[8rem] font-extrabold leading-none text-white/[0.06] select-none">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            aria-hidden="true"
            className="h-16 w-16 text-brand-500/60"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
          </svg>
        </div>
      </div>

      <h1 className="text-3xl font-extrabold md:text-4xl">Track not found.</h1>
      <p className="mt-4 max-w-md text-base leading-7 text-white/50">
        This page doesn&apos;t exist or was removed. Head back to the
        marketplace to discover licensed music.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/marketplace"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 glow-purple-sm"
        >
          Browse Marketplace
        </Link>
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
