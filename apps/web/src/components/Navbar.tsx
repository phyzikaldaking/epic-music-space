import Link from "next/link";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";
import NotificationBell from "@/components/NotificationBell";

export default async function Navbar() {
  const authConfigured = Boolean(
    process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  );
  let session: Session | null = null;

  if (authConfigured) {
    try {
      session = await auth();
    } catch (error) {
      if (!isDynamicServerBailout(error)) {
        console.error("[navbar] Auth unavailable", error);
      }
    }
  }

  const navLinks = session
    ? [
        { href: "/marketplace", label: "Browse" },
        { href: "/auctions", label: "Auctions" },
        { href: "/versus", label: "Battles" },
        { href: "/leaderboard", label: "Charts" },
        { href: "/city", label: "City" },
        { href: "/dashboard", label: "Dashboard" },
        { href: "/boost", label: "Boost" },
      ]
    : [
        { href: "/marketplace", label: "Browse" },
        { href: "/legal/licensing", label: "Licensing" },
        { href: "/pricing", label: "Pricing" },
        { href: "/leaderboard", label: "Charts" },
        { href: "/studio/new", label: "For Artists" },
      ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 text-xl font-extrabold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-500/20 glow-purple-sm">
            <svg
              aria-hidden="true"
              className="h-4 w-4 text-accent-300"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
            </svg>
          </span>
          <span className="hidden truncate text-gradient-ems sm:inline">
            Epic Music Space
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-1 text-sm font-medium md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-white/60 transition hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="hidden md:flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400">
                  {(session.user?.name ??
                    session.user?.email ??
                    "?")[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-white/55">
                  {session.user?.name ?? session.user?.email}
                </span>
              </div>
              <Link
                href="/profile/edit"
                className="hidden rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
              >
                Profile
              </Link>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="hidden rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="hidden rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 glow-purple-sm sm:inline-flex"
              >
                Get started
              </Link>
            </>
          )}
          <NavbarMobileMenu navLinks={navLinks} isLoggedIn={!!session} />
        </div>
      </div>
    </nav>
  );
}

function isDynamicServerBailout(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "DYNAMIC_SERVER_USAGE"
  );
}
