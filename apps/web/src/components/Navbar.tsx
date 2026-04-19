import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Navbar() {
  const session = await auth();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="text-brand-400">🎵</span>
          <span className="bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
            Epic Music Space
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-5 text-sm font-medium md:flex">
          <Link href="/pricing" className="text-white/70 hover:text-white transition">
            Pricing
          </Link>
          <Link href="/marketplace" className="text-white/70 hover:text-white transition">
            Marketplace
          </Link>
          <Link href="/versus" className="text-white/70 hover:text-white transition">
            Versus
          </Link>
          <Link href="/city" className="text-white/70 hover:text-white transition">
            City
          </Link>
          <Link href="/leaderboard" className="text-white/70 hover:text-white transition">
            Charts
          </Link>
          <Link href="/label" className="text-white/70 hover:text-white transition">
            Labels
          </Link>
          <Link href="/ai" className="text-white/70 hover:text-white transition">
            AI
          </Link>
          {session && (
            <Link href="/dashboard" className="text-white/70 hover:text-white transition">
              Dashboard
            </Link>
          )}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-white/60 md:block">
                {session.user?.name ?? session.user?.email}
              </span>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10 transition"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="rounded-lg border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10 transition"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold hover:bg-brand-600 transition"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

