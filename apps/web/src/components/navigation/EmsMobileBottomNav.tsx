import Link from "next/link";

const mobileLinks = [
  { href: "/studio/try", label: "Studio" },
  { href: "/listening-sessions", label: "Live" },
  { href: "/marketplace", label: "Market" },
  { href: "/dashboard", label: "Dash" },
  { href: "/studio/beat-machine", label: "Beat" },
];

export default function EmsMobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[130] border-t border-white/10 bg-black/85 px-2 py-2 text-white shadow-[0_-10px_30px_rgba(0,0,0,.4)] backdrop-blur md:hidden" aria-label="Epic Music Space mobile navigation">
      <div className="grid grid-cols-5 gap-1">
        {mobileLinks.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-xl border border-white/10 bg-white/[.035] px-1 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white/65 active:border-cyan-300/70 active:bg-cyan-300/15 active:text-cyan-100">
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
