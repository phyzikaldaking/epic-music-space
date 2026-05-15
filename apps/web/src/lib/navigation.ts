export type NavEntry = {
  href: string;
  label: string;
  icon?: string;
  description?: string;
  navChip?: string;
  /** Extra pathname prefixes that should mark this entry active. */
  activePrefixes?: string[];
};

export const NAV_PUBLIC: NavEntry[] = [
  { href: "/", label: "Home", navChip: "HM", description: "Back to the front page" },
  { href: "/studio", label: "Studio", navChip: "ST", description: "Make beats, mix, and publish in your browser" },
  { href: "/podcast", label: "Podcast", navChip: "PC", description: "Launch a video-first podcast with clips, captions, and live community" },
  { href: "/versus", label: "Battles", navChip: "BT", description: "Quick 1v1, Royale, and Verzuz events", activePrefixes: ["/verzuz"] },
  { href: "/rooms", label: "Sessions", navChip: "SS", description: "Join live rooms with artists and fans", activePrefixes: ["/rooms"] },
  { href: "/timeline", label: "Timeline", navChip: "TL", description: "Your activity and community feed", activePrefixes: ["/forum", "/feed", "/post/"] },
  { href: "/vault", label: "Vault", navChip: "VT", description: "Legacy catalogs from working artists" },
  { href: "/marketplace", label: "Tracks", navChip: "TR", description: "Discover and support trending music" },
  { href: "/trending", label: "Trending", navChip: "TD", description: "What's hot right now" },
  { href: "/radar", label: "Radar", navChip: "RD", description: "Artists moving before the charts" },
  { href: "/leaderboard", label: "Charts", navChip: "CH", description: "AI rankings + boost meter" },
  { href: "/services", label: "Services", navChip: "SV", description: "Producers, engineers, mixers" },
  { href: "/pricing", label: "Pricing", navChip: "PR", description: "Plans for fans + artists" },
  { href: "/get-the-app", label: "Get App", navChip: "AP", description: "Download for iOS & Android" },
];

export const NAV_AUTHED: NavEntry[] = [
  { href: "/", label: "Home", navChip: "HM", description: "Back to the front page" },
  { href: "/studio", label: "Studio", navChip: "ST", description: "Beat machine, mixer, upload — your control room" },
  { href: "/podcast", label: "Podcast", navChip: "PC", description: "Video-first podcasting, clips, transcripts, and live aftershows", activePrefixes: ["/studio/podcast"] },
  { href: "/studio/board", label: "Beat Board", navChip: "BB", description: "In-browser DAW with 7 kits + multitrack" },
  { href: "/versus", label: "Battles", navChip: "BT", description: "Quick 1v1, Royale, and Verzuz events", activePrefixes: ["/verzuz"] },
  { href: "/rooms", label: "Sessions", navChip: "SS", description: "Join live rooms with artists and fans", activePrefixes: ["/rooms"] },
  { href: "/timeline", label: "Timeline", navChip: "TL", description: "Your activity and community feed", activePrefixes: ["/forum", "/feed", "/post/"] },
  { href: "/vault", label: "Vault", navChip: "VT", description: "Legacy catalogs from working artists" },
  { href: "/marketplace", label: "Tracks", navChip: "TR", description: "Discover and support trending music" },
  { href: "/trending", label: "Trending", navChip: "TD", description: "What's hot right now" },
  { href: "/radar", label: "Radar", navChip: "RD", description: "Artists moving before the charts" },
  { href: "/leaderboard", label: "Charts", navChip: "CH", description: "AI rankings + boost meter" },
  { href: "/services", label: "Services", navChip: "SV", description: "Producers, engineers, mixers" },
  { href: "/auctions", label: "Auctions", navChip: "AU", description: "Bid on placement" },
  { href: "/library", label: "Library", navChip: "LB", description: "Saved tracks" },
  { href: "/messages", label: "Messages", navChip: "MS", description: "DMs with other artists + fans" },
  { href: "/dashboard", label: "Dashboard", navChip: "DB", description: "Your earnings + stats" },
  { href: "/dashboard/wallet", label: "Wallet", navChip: "WL", description: "Payouts + balances" },
];

export const CORE_PRIMARY_HREFS = ["/", "/studio", "/versus", "/studio/live", "/timeline"] as const;

export const MOBILE_TABS: NavEntry[] = [
  { href: "/", label: "Home", navChip: "HM", activePrefixes: [] },
  { href: "/studio", label: "Studio", navChip: "ST" },
  { href: "/versus", label: "Battles", navChip: "BT", activePrefixes: ["/verzuz"] },
  { href: "/rooms", label: "Sessions", navChip: "SS", activePrefixes: ["/rooms"] },
  { href: "/timeline", label: "Timeline", navChip: "TL", activePrefixes: ["/forum", "/feed", "/post/"] },
];
