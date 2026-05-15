import Link from "next/link";
import { mobileStoreLinks } from "@/lib/mobileApp";

const footerNav = [
  { heading: "Explore", links: [
    { label: "Marketplace", href: "/marketplace" },
    { label: "Timeline", href: "/timeline" },
    { label: "Rooms", href: "/rooms" },
    { label: "Versus", href: "/versus" },
    { label: "Leaderboard", href: "/leaderboard" },
  ] },
  { heading: "Artists", links: [
    { label: "Create artist account", href: "/auth/signup?callbackUrl=/studio/setup" },
    { label: "Upload a track (sign in)", href: "/auth/signin?callbackUrl=/studio/new" },
    { label: "Artist dashboard (sign in)", href: "/auth/signin?callbackUrl=/dashboard" },
    { label: "Analytics (sign in)", href: "/auth/signin?callbackUrl=/analytics" },
    { label: "Boost (sign in)", href: "/auth/signin?callbackUrl=/boost" },
    { label: "Label Portal", href: "/label" },
  ] },
  { heading: "Platform", links: [
    { label: "Pricing", href: "/pricing" },
    { label: "AI Assistant (sign in)", href: "/auth/signin?callbackUrl=/ai" },
    { label: "Playlists", href: "/playlists" },
    { label: "Redeem a code", href: "/redeem" },
    { label: "Get the app", href: "/get-the-app" },
  ] },
  { heading: "Company", links: [
    { label: "Support", href: "/support" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "DMCA", href: "/dmca" },
  ] },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#06080a]">
      <span aria-hidden className="studio-walnut absolute inset-x-0 top-0 h-1" />
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50">
              <span className="studio-tube-bezel relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md">
                <svg aria-hidden="true" className="studio-tube-bezel-icon h-4 w-4 text-tube-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
                </svg>
              </span>
              <span className="font-display text-lg uppercase tracking-[0.14em] text-white">Epic Music Space</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/42">Host live listening sessions, upload music, and sell clear digital licenses from one artist studio.</p>
            <div className="mt-5 flex gap-3">
              <Link href="/get-the-app" className="inline-flex items-center rounded-md studio-faceplate-dark px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] text-white/85 transition hover:text-tube-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50">Get the app</Link>
              <Link href="/auth/signup" className="studio-engage-btn inline-flex items-center rounded-md px-3 py-1.5 font-display text-xs uppercase tracking-[0.14em] focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50">Get started</Link>
            </div>
            <div className="mt-5 flex flex-col gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/30">Get the App</p>
              <div className="flex flex-wrap gap-2">
                {mobileStoreLinks.ios.available ? (
                  <a href={mobileStoreLinks.ios.href ?? "/get-the-app"} target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store" className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">App Store</a>
                ) : (
                  <span aria-label="iPhone app coming soon" className="flex cursor-default items-center gap-2 rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/35">iPhone <span className="rounded-full border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/45">Soon</span></span>
                )}
                {mobileStoreLinks.android.available ? (
                  <a href={mobileStoreLinks.android.href ?? "/get-the-app"} target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play" className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Google Play</a>
                ) : (
                  <span aria-label="Android app coming soon" className="flex cursor-default items-center gap-2 rounded-lg border border-dashed border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/35">Android <span className="rounded-full border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/45">Soon</span></span>
                )}
              </div>
            </div>
          </div>
          {footerNav.map((col) => (
            <div key={col.heading}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/30">{col.heading}</p>
              <ul className="space-y-2.5" role="list">
                {col.links.map((link) => (
                  <li key={link.href}><Link href={link.href} className="text-sm text-white/48 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">{link.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/8 pt-6 text-xs text-white/28 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Epic Music Space. All rights reserved.</p>
          <p className="max-w-lg text-center leading-5 sm:text-right">Digital content licenses only — not securities or financial instruments. Review our <Link href="/license-agreement" prefetch={false} className="underline hover:text-white/50">Licensing Agreement</Link> before purchasing.</p>
        </div>
      </div>
    </footer>
  );
}
