import Link from "next/link";
import NavbarLinks from "@/components/NavbarLinks";
import NavbarAuth from "@/components/NavbarAuth";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";
import NavbarSearch from "@/components/NavbarSearch";
import NotificationBell from "@/components/NotificationBell";

const PUBLIC_LINKS = [
  { href: "/feed", label: "Feed", icon: "🏠", description: "Posts from artists you follow" },
  { href: "/trending", label: "Trending", icon: "🔥", description: "What's hot right now" },
  { href: "/studio/live", label: "Sessions", icon: "🎙️", description: "Drop into a live audio room" },
  { href: "/versus", label: "Battles", icon: "⚔️", description: "1v1, Royale, and Verzuz showdowns" },
  { href: "/marketplace", label: "Tracks", icon: "🎵", description: "License music with clear rights" },
  { href: "/services", label: "Services", icon: "🛠️", description: "Producers, engineers, mixers" },
  { href: "/leaderboard", label: "Charts", icon: "📊", description: "AI rankings + boost meter" },
  { href: "/pricing", label: "Pricing", icon: "💎", description: "Plans for fans + artists" },
  { href: "/get-the-app", label: "Get App", icon: "📲", description: "Download for iOS & Android" },
];

const AUTHED_LINKS = [
  { href: "/feed", label: "Feed", icon: "🏠", description: "Posts from artists you follow" },
  { href: "/trending", label: "Trending", icon: "🔥", description: "What's hot right now" },
  { href: "/studio/live", label: "Sessions", icon: "🎙️", description: "Drop into a live audio room" },
  { href: "/versus", label: "Battles", icon: "⚔️", description: "Vote on track battles" },
  { href: "/marketplace", label: "Tracks", icon: "🎵", description: "License music with clear rights" },
  { href: "/services", label: "Services", icon: "🛠️", description: "Producers, engineers, mixers" },
  { href: "/leaderboard", label: "Charts", icon: "📊", description: "AI rankings + boost meter" },
  { href: "/auctions", label: "Auctions", icon: "🔨", description: "Bid on placement" },
  { href: "/library", label: "Library", icon: "📀", description: "Saved tracks" },
  { href: "/messages", label: "Messages", icon: "💬", description: "DMs with other artists + fans" },
  { href: "/dashboard", label: "Dashboard", icon: "📈", description: "Your earnings + stats" },
  { href: "/dashboard/wallet", label: "Wallet", icon: "💰", description: "Payouts + balances" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin", icon: "🛡️", description: "Moderation + ops" };

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
          <NavbarSearch />
          <Link
            href="/ai"
            aria-label="Open AI assistant"
            title="AI assistant"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/60 transition hover:border-white/24 hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
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
          <NavbarMobileMenu publicLinks={PUBLIC_LINKS} authedLinks={AUTHED_LINKS} />
        </div>
      </div>
    </nav>
  );
}
