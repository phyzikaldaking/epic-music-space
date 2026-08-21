import Link from "next/link";

const links = [
  { label: "Discover", href: "/trending" },
  { label: "Studio", href: "/studio" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Pricing", href: "/pricing" },
  { label: "Support", href: "/support" },
  { label: "Contact", href: "/contact" },
];

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "DMCA", href: "/dmca" },
  { label: "License agreement", href: "/license-agreement" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#080808] text-[#f2ede3]">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
        <div className="flex flex-col justify-between gap-12 lg:flex-row lg:items-start">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
            >
              <span className="flex h-8 w-8 items-center justify-center border border-[#c9a96e] font-serif text-lg italic text-[#c9a96e]">
                E
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.24em]">
                Epic Music Space
              </span>
            </Link>
            <p className="mt-5 text-sm leading-6 text-[#d1cbc0]/50">
              Independent music, in motion. Make it, discover it, and license it
              on clear terms.
            </p>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-3"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d1cbc0]/50 transition hover:text-[#c9a96e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col justify-between gap-6 border-t border-white/10 pt-6 text-[10px] uppercase tracking-[0.14em] text-white/30 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Epic Music Space</p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                prefetch={false}
                className="transition hover:text-[#c9a96e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
