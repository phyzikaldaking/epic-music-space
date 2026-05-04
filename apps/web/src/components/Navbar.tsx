import Link from "next/link";
import NavbarLinks from "@/components/NavbarLinks";
import NavbarAuth from "@/components/NavbarAuth";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";

const PUBLIC_LINKS = [
  { href: "/studio/live", label: "Sessions" },
  { href: "/versus", label: "Battles" },
  { href: "/marketplace", label: "Tracks" },
  { href: "/services", label: "Services" },
  { href: "/leaderboard", label: "Charts" },
  { href: "/pricing", label: "Pricing" },
];

const AUTHED_LINKS = [
  { href: "/studio/live", label: "Sessions" },
  { href: "/versus", label: "Battles" },
  { href: "/marketplace", label: "Tracks" },
  { href: "/services", label: "Services" },
  { href: "/leaderboard", label: "Charts" },
  { href: "/auctions", label: "Auctions" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/wallet", label: "Wallet" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin" };

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
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

        <NavbarLinks
          publicLinks={PUBLIC_LINKS}
          authedLinks={AUTHED_LINKS}
          adminLink={ADMIN_LINK}
        />

        <div className="flex items-center gap-3">
          <NavbarAuth />
          <NavbarMobileMenu publicLinks={PUBLIC_LINKS} authedLinks={AUTHED_LINKS} />
        </div>
      </div>
    </nav>
  );
}
