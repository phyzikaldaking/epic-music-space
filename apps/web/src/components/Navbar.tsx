import Link from "next/link";
import { auth } from "@/lib/auth";
import NavbarMobile from "./NavbarMobile";

const PUBLIC_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/city",        label: "City" },
  { href: "/versus",      label: "Versus" },
  { href: "/leaderboard", label: "Charts" },
  { href: "/label",       label: "Labels" },
  { href: "/ai",          label: "AI" },
  { href: "/pricing",     label: "Pricing" },
];

const AUTH_LINKS = [
  { href: "/dashboard",   label: "Dashboard" },
  { href: "/profile/edit",label: "Profile" },
  { href: "/analytics",   label: "Analytics" },
  { href: "/invite",      label: "🔗 Invite",  className: "text-green-400/80 hover:bg-green-500/10 hover:text-green-400 font-semibold" },
  { href: "/boost",       label: "⚡ Boost",   className: "text-brand-400/80 hover:bg-brand-500/10 hover:text-brand-400 font-semibold" },
];

export default async function Navbar() {
  const session = await auth();
  const isLoggedIn = !!session?.user?.id;

  const allMobileLinks = isLoggedIn
    ? [...PUBLIC_LINKS, ...AUTH_LINKS]
    : PUBLIC_LINKS;

  const userInitial = (session?.user?.name ?? session?.user?.email ?? "?")[0]?.toUpperCase() ?? "?";
  const userName = session?.user?.name ?? session?.user?.email ?? "";

  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-lg glow-purple-sm border border-brand-500/30">
            🎵
          </span>
          <span className="text-gradient-ems">Epic Music Space</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-1 text-sm font-medium md:flex">
          {PUBLIC_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-white/60 transition hover:bg-white/6 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          {isLoggedIn && AUTH_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 transition ${link.className ?? "text-white/60 hover:bg-white/6 hover:text-white"}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400">
                  {userInitial}
                </div>
                <span className="text-sm text-white/55">{userName}</span>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg border border-white/15 px-4 py-1.5 text-sm hover:bg-white/8 transition text-white/70 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 hover:bg-white/8 hover:text-white transition"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-600 glow-purple-sm"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger + drawer (client component) */}
        <NavbarMobile
          links={allMobileLinks}
          isLoggedIn={isLoggedIn}
          userInitial={userInitial}
          userName={userName}
        />
      </div>
    </nav>
  );
}


