import Link from "next/link";

const primaryLinks = [
  { href: "/studio/try", label: "Studio" },
  { href: "/listening-sessions", label: "Listening Sessions" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/studio/beat-machine", label: "Beat Machine" },
  { href: "/music-consultant", label: "Consultant" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pricing", label: "Pricing" },
];

export default function EmsMainMenu() {
  return (
    <nav className="sticky top-0 z-[120] border-b border-white/10 bg-black/75 px-3 py-2 text-white shadow-[0_10px_30px_rgba(0,0,0,.35)] backdrop-blur" aria-label="Epic Music Space main menu">
      <div className="mx-auto flex min-w-[1180px] max-w-[1680px] items-center justify-between gap-3">
        <Link href="/" className="shrink-0 text-sm font-black uppercase tracking-[0.24em] text-cyan-100">
          Epic Music Space
        </Link>
        <div className="flex flex-1 items-center justify-center gap-2 overflow-x-auto px-2">
          {primaryLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full border border-white/10 bg-white/[.035] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/65 transition hover:border-cyan-300/60 hover:bg-cyan-300/10 hover:text-cyan-100">
              {link.label}
            </Link>
          ))}
        </div>
        <Link href="/listening-sessions?host=1" className="shrink-0 rounded-full border border-pink-300/40 bg-pink-300/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-pink-100">
          Go Live
        </Link>
      </div>
    </nav>
  );
}
