import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-500/12 blur-[120px]" />

      <div className="relative">
        <p className="text-8xl font-black text-gradient-ems animate-pulse-glow">404</p>
        <h1 className="mt-4 text-2xl font-extrabold">Page not found</h1>
        <p className="mt-3 max-w-sm text-white/40">
          Looks like this track got lost in the city. Head back to the marketplace and find your next favorite song.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/"
            className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600 glow-purple-sm"
          >
            Back to Home
          </Link>
          <Link
            href="/marketplace"
            className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/8 hover:text-white"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    </div>
  );
}
