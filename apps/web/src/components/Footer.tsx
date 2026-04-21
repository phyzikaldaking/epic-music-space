import Link from "next/link";

const footerNav = [
  {
    heading: "Marketplace",
    links: [
      { label: "Browse Tracks", href: "/marketplace" },
      { label: "Trending Charts", href: "/leaderboard" },
      { label: "Space Music", href: "/marketplace?search=space" },
      { label: "Sci-Fi Trailers", href: "/marketplace?search=sci-fi%20trailer" },
      { label: "Game Cues", href: "/marketplace?search=game" },
    ],
  },
  {
    heading: "Artists",
    links: [
      { label: "Upload a Track", href: "/studio/new" },
      { label: "Artist Dashboard", href: "/dashboard" },
      { label: "Analytics", href: "/analytics" },
      { label: "Boost a Track", href: "/boost" },
      { label: "Label Portal", href: "/label" },
      { label: "Invite & Earn", href: "/invite" },
    ],
  },
  {
    heading: "Platform",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Versus Battles", href: "/versus" },
      { label: "City View", href: "/city" },
      { label: "AI Score Info", href: "/legal/licensing#ai-score" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Licensing Agreement", href: "/legal/licensing" },
      { label: "Contact", href: "mailto:legal@epicmusicspace.com" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/8 bg-[#070709]">
      <div className="mx-auto max-w-7xl px-4 py-14">
        {/* Top row: brand + nav grid */}
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 text-lg font-extrabold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
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
              <span className="text-gradient-ems">Epic Music Space</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/42">
              License cinematic space music with clear rights, instant previews,
              and transparent revenue participation.
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href="/marketplace"
                className="inline-flex items-center rounded-lg bg-brand-500/15 border border-brand-500/25 px-3 py-1.5 text-xs font-semibold text-brand-300 transition hover:bg-brand-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Browse Tracks
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Get started
              </Link>
            </div>
          </div>

          {/* Nav columns */}
          {footerNav.map((col) => (
            <div key={col.heading}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/30">
                {col.heading}
              </p>
              <ul className="space-y-2.5" role="list">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/48 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/8 pt-6 text-xs text-white/28 sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} Epic Music Space. All rights reserved.
          </p>
          <p className="max-w-lg text-center leading-5 sm:text-right">
            Digital content licenses only — not securities or financial
            instruments. Review our{" "}
            <Link href="/legal/licensing" className="underline hover:text-white/50">
              Licensing Agreement
            </Link>{" "}
            before purchasing.
          </p>
        </div>
      </div>
    </footer>
  );
}
