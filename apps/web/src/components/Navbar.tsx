import Link from "next/link";
import NavbarLinks from "@/components/NavbarLinks";
import NavbarAuth from "@/components/NavbarAuth";
import NavbarMobileMenu from "@/components/NavbarMobileMenu";
import NavbarSearch from "@/components/NavbarSearch";
import NotificationBell from "@/components/NotificationBell";

const PUBLIC_LINKS = [
  { href: "/", label: "Home", icon: "🏠", description: "Back to the front page" },
  { href: "/studio", label: "Studio", icon: "🎛️", description: "Make beats, mix, and publish in your browser" },
  { href: "/versus", label: "Battles", icon: "⚔️", description: "1v1, Royale, and Verzuz showdowns" },
  { href: "/vault", label: "Vault", icon: "📼", description: "Legacy catalogs from working artists" },
  { href: "/marketplace", label: "Tracks", icon: "🎵", description: "Discover and support trending music" },
  { href: "/studio/live", label: "Sessions", icon: "🎙️", description: "Join live rooms with artists and fans" },
  { href: "/trending", label: "Trending", icon: "🔥", description: "What's hot right now" },
  { href: "/radar", label: "Radar", icon: "📡", description: "Artists moving before the charts" },
  { href: "/leaderboard", label: "Charts", icon: "📊", description: "AI rankings + boost meter" },
  { href: "/services", label: "Services", icon: "🛠️", description: "Producers, engineers, mixers" },
  { href: "/pricing", label: "Pricing", icon: "💎", description: "Plans for fans + artists" },
  { href: "/get-the-app", label: "Get App", icon: "📲", description: "Download for iOS & Android" },
];

const AUTHED_LINKS = [
  { href: "/", label: "Home", icon: "🏠", description: "Back to the front page" },
  { href: "/studio", label: "Studio", icon: "🎛️", description: "Beat machine, mixer, upload — your control room" },
  { href: "/studio/board", label: "Beat Board", icon: "🥁", description: "In-browser DAW with 7 kits + multitrack" },
  { href: "/versus", label: "Battles", icon: "⚔️", description: "Vote on track battles" },
  { href: "/vault", label: "Vault", icon: "📼", description: "Legacy catalogs from working artists" },
  { href: "/marketplace", label: "Tracks", icon: "🎵", description: "Discover and support trending music" },
  { href: "/studio/live", label: "Sessions", icon: "🎙️", description: "Join live rooms with artists and fans" },
  { href: "/feed", label: "Feed", icon: "📰", description: "Posts from artists you follow" },
  { href: "/trending", label: "Trending", icon: "🔥", description: "What's hot right now" },
  { href: "/radar", label: "Radar", icon: "📡", description: "Artists moving before the charts" },
  { href: "/leaderboard", label: "Charts", icon: "📊", description: "AI rankings + boost meter" },
  { href: "/services", label: "Services", icon: "🛠️", description: "Producers, engineers, mixers" },
  { href: "/auctions", label: "Auctions", icon: "🔨", description: "Bid on placement" },
  { href: "/library", label: "Library", icon: "📀", description: "Saved tracks" },
  { href: "/messages", label: "Messages", icon: "💬", description: "DMs with other artists + fans" },
  { href: "/dashboard", label: "Dashboard", icon: "📈", description: "Your earnings + stats" },
  { href: "/dashboard/wallet", label: "Wallet", icon: "💰", description: "Payouts + balances" },
];

const ADMIN_LINK = { href: "/admin", label: "Admin", icon: "🛡️", description: "Moderation + ops" };

// Inline desktop nav stays focused — Home + the flagship destinations.
// Studio is the new product surface (browser DAW + quick upload), so it
// gets a primary slot for both anonymous and signed-in viewers. Everything
// else still lives in the mobile menu and the user's dashboard.
const PRIMARY_PUBLIC_LINKS = PUBLIC_LINKS.filter((l) =>
  ["/", "/studio", "/versus", "/vault", "/marketplace", "/studio/live"].includes(l.href),
);
const PRIMARY_AUTHED_LINKS = AUTHED_LINKS.filter((l) =>
  ["/", "/studio", "/versus", "/vault", "/marketplace", "/studio/live"].includes(l.href),
);

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          aria-label="Epic Music Space — Home"
          title="Home"
          // `flex-shrink-0` so the brand is never truncated by neighboring
          // nav items competing for width. The nav links scroll / wrap
          // before the brand loses characters — "Epic Music …" on the
          // brand's own homepage was a credibility issue caught in audit.
          className="flex flex-shrink-0 items-center gap-2.5 text-xl font-extrabold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
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
          <span className="hidden whitespace-nowrap text-gradient-ems sm:inline">
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
          <Link
            href="/ai"
            aria-label="Open AI assistant"
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
          <NavbarMobileMenu publicLinks={PUBLIC_LINKS} authedLinks={AUTHED_LINKS} />
        </div>
      </div>
    </nav>
  );
}
