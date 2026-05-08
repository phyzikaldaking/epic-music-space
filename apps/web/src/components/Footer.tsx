import Link from "next/link";
import { mobileStoreLinks } from "@/lib/mobileApp";

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
      { label: "AI Assistant", href: "/ai" },
      { label: "Get the App", href: "/get-the-app" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "Profile", href: "/profile/edit" },
      { label: "Library", href: "/library" },
      { label: "Playlists", href: "/playlists" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Privacy & data", href: "/settings/privacy" },
      { label: "Support", href: "/support" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "License Agreement", href: "/license-agreement" },
      { label: "DMCA / Copyright", href: "/dmca" },
      { label: "Contact", href: "mailto:legal@epicmusicspace.com" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#06080a]">
      {/* Walnut top trim — same silhouette as the navbar but mirrored
          at the bottom of the page. The site sits inside a rack. */}
      <span aria-hidden className="studio-walnut absolute inset-x-0 top-0 h-1" />
      <div className="mx-auto max-w-7xl px-4 py-14">
        {/* Top row: brand + nav grid */}
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 rounded-md"
            >
              <span className="studio-tube-bezel relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md">
                <svg
                  aria-hidden="true"
                  className="studio-tube-bezel-icon h-4 w-4 text-tube-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
                </svg>
              </span>
              <span className="font-display text-lg uppercase tracking-[0.14em] text-white">
                Epic Music Space
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/42">
              Host live listening sessions, upload music, and sell clear digital
              licenses from one artist studio.
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                href="/get-the-app"
                className="inline-flex items-center rounded-md studio-faceplate-dark px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-white/85 transition hover:text-tube-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50"
              >
                Get the app
              </Link>
              <Link
                href="/auth/signup"
                className="studio-engage-btn inline-flex items-center rounded-md px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50"
              >
                Get started
              </Link>
            </div>
            {/* App store badges. When a store isn't shipped yet we render a
                non-clickable badge with a "Soon" tag — the previous version
                used <a>s that looked identical to the live state, which read
                as broken links to anyone who clicked. */}
            <div className="mt-5 flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Get the App</p>
              <div className="flex flex-wrap gap-2">
                {mobileStoreLinks.ios.available ? (
                  <a
                    href={mobileStoreLinks.ios.href ?? "/get-the-app"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Download on the App Store"
                    className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
                    </svg>
                    App Store
                  </a>
                ) : (
                  <span
                    aria-label="iPhone app coming soon"
                    className="flex cursor-default items-center gap-2 rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/35"
                  >
                    <svg className="h-4 w-4 flex-shrink-0 opacity-60" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z"/>
                    </svg>
                    iPhone
                    <span className="rounded-full border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/45">Soon</span>
                  </span>
                )}
                {mobileStoreLinks.android.available ? (
                  <a
                    href={mobileStoreLinks.android.href ?? "/get-the-app"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Get it on Google Play"
                    className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#EA4335" d="m1.22 0 10.42 10.41L1.22 0Z"/>
                      <path fill="#FBBC04" d="M1.22 24 11.64 13.59 1.22 24Z"/>
                      <path fill="#4285F4" d="M20.11 10.43 16.9 8.6 11.64 13.59l5.26 4.99 3.22-1.83a2.5 2.5 0 0 0 0-4.32Z"/>
                      <path fill="#34A853" d="M1.22 0a2.06 2.06 0 0 0-.95.24L11.64 10.41l5.26-4.99L1.22 0Z"/>
                      <path fill="#34A853" d="m.27 23.76 11.37-10.17L1.22 24a2.06 2.06 0 0 1-.95-.24Z"/>
                      <path fill="#EA4335" d="M1.22 24a2.06 2.06 0 0 1-.95-.24L11.64 13.59.27.24A2.06 2.06 0 0 0 .22 1.26v21.48A2.06 2.06 0 0 0 1.22 24Z"/>
                    </svg>
                    Google Play
                  </a>
                ) : (
                  <span
                    aria-label="Android app coming soon"
                    className="flex cursor-default items-center gap-2 rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/35"
                  >
                    <svg className="h-4 w-4 flex-shrink-0 opacity-60" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#EA4335" d="m1.22 0 10.42 10.41L1.22 0Z"/>
                      <path fill="#FBBC04" d="M1.22 24 11.64 13.59 1.22 24Z"/>
                      <path fill="#4285F4" d="M20.11 10.43 16.9 8.6 11.64 13.59l5.26 4.99 3.22-1.83a2.5 2.5 0 0 0 0-4.32Z"/>
                      <path fill="#34A853" d="M1.22 0a2.06 2.06 0 0 0-.95.24L11.64 10.41l5.26-4.99L1.22 0Z"/>
                      <path fill="#34A853" d="m.27 23.76 11.37-10.17L1.22 24a2.06 2.06 0 0 1-.95-.24Z"/>
                      <path fill="#EA4335" d="M1.22 24a2.06 2.06 0 0 1-.95-.24L11.64 13.59.27.24A2.06 2.06 0 0 0 .22 1.26v21.48A2.06 2.06 0 0 0 1.22 24Z"/>
                    </svg>
                    Android
                    <span className="rounded-full border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/45">Soon</span>
                  </span>
                )}
              </div>
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
