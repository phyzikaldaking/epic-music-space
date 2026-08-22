import Link from "next/link";
import NavbarAuth from "@/components/NavbarAuth";
import NavbarLinks from "@/components/NavbarLinks";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";
import NavbarSearch from "@/components/NavbarSearch";
import NotificationBell from "@/components/NotificationBell";
import { NAV_AUTHED, NAV_PUBLIC } from "@/lib/navigation";

const ADMIN_LINK = {
  href: "/admin",
  label: "Admin",
  description: "Moderation and operations",
};

const PRIMARY_LINKS = [
  { href: "/trending", label: "Discover" },
  { href: "/studio", label: "Studio" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/onboarding/creator", label: "For Artists" },
];

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#080808]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Epic Music Space — Home"
          data-ui-sfx="page"
          className="flex shrink-0 items-center gap-3 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
        >
          <span className="flex h-8 w-8 items-center justify-center border border-[#c9a96e] font-serif text-lg italic text-[#c9a96e]">
            E
          </span>
          <span className="hidden text-xs font-bold uppercase tracking-[0.24em] text-[#f2ede3] sm:inline">
            Epic Music Space
          </span>
        </Link>

        <NavbarLinks
          publicLinks={PRIMARY_LINKS}
          authedLinks={PRIMARY_LINKS}
          adminLink={ADMIN_LINK}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <NavbarSearch />
          <span className="hidden lg:block">
            <NotificationBell />
          </span>
          <NavbarAuth />
          <NavbarMobileMenu publicLinks={NAV_PUBLIC} authedLinks={NAV_AUTHED} />
        </div>
      </div>
    </nav>
  );
}
