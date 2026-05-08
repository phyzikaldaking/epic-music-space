import Link from "next/link";
import NavbarLinks from "@/components/NavbarLinks";
import NavbarAuth from "@/components/NavbarAuth";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";
import NavbarSearch from "@/components/NavbarSearch";
import NotificationBell from "@/components/NotificationBell";
import UISfxToggleButton from "@/components/UISfxToggleButton";
import { CORE_PRIMARY_HREFS, NAV_AUTHED, NAV_PUBLIC } from "@/lib/navigation";

const ADMIN_LINK = { href: "/admin", label: "Admin", icon: "🛡️", description: "Moderation + ops" };

// Inline desktop nav stays focused — Home + the flagship destinations.
// Studio is the new product surface (browser DAW + quick upload), so it
// gets a primary slot for both anonymous and signed-in viewers. Everything
// else still lives in the mobile menu and the user's dashboard.
// Primary bar = the four core action surfaces + home. Vault and Marketplace
// stay in the full mobile menu until catalog depth is stronger.
const PRIMARY_PUBLIC_LINKS = NAV_PUBLIC.filter((l) =>
  CORE_PRIMARY_HREFS.includes(l.href as (typeof CORE_PRIMARY_HREFS)[number]),
);
const PRIMARY_AUTHED_LINKS = NAV_AUTHED.filter((l) =>
  CORE_PRIMARY_HREFS.includes(l.href as (typeof CORE_PRIMARY_HREFS)[number]),
);

export default function Navbar() {
  return (
    <nav className="studio-nav sticky top-0 z-50">
      {/* Walnut top trim — sells the "rack-mounted gear" silhouette. */}
      <span aria-hidden className="studio-walnut absolute inset-x-0 top-0 h-1" />
      <div className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          aria-label="Epic Music Space — Home"
          title="Home"
          data-ui-sfx="page"
          className="flex flex-shrink-0 items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 rounded-md"
        >
          {/* Logo "VU mark" — looks like a vacuum tube with an amber glow. */}
          <span className="studio-tube-bezel relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md">
            <svg
              aria-hidden="true"
              className="studio-tube-bezel-icon h-4 w-4 text-tube-400"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
            </svg>
            <span aria-hidden className="led-on-amber absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full" />
          </span>
          <span className="hidden whitespace-nowrap font-display text-xl uppercase tracking-[0.14em] text-white sm:inline">
            Epic Music Space
          </span>
        </Link>

        <NavbarLinks
          publicLinks={PRIMARY_PUBLIC_LINKS}
          authedLinks={PRIMARY_AUTHED_LINKS}
          adminLink={ADMIN_LINK}
        />

        <div className="flex items-center gap-3">
          <NavbarSearch />
          <UISfxToggleButton />
          <Link
            href="/ai"
            aria-label="Open AI assistant"
            data-ui-sfx="page"
            title="AI assistant"
            className="hidden h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/60 transition hover:border-white/24 hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:flex"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.2 4.3L17.5 9l-4.3 1.2L12 14.5l-1.2-4.3L6.5 9l4.3-1.7L12 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12l.7 2.5L22 16l-2.3.6L19 19l-.7-2.4L16 16l2.3-1.5L19 12z" />
            </svg>
          </Link>
          <NotificationBell />
          <NavbarAuth />
          <NavbarMobileMenu publicLinks={NAV_PUBLIC} authedLinks={NAV_AUTHED} />
        </div>
      </div>
    </nav>
  );
}
