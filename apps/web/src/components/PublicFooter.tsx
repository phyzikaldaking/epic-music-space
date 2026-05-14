"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const platformLinks = [
  { href: "/studio/try", label: "Try Studio" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/versus", label: "Battles" },
  { href: "/rooms", label: "Live Rooms" },
];

const trustLinks = [
  { href: "/how-licenses-work", label: "How Licenses Work" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
];

export default function PublicFooter() {
  const pathname = usePathname() ?? "";
  const isStudioRoute = pathname === "/studio" || pathname.startsWith("/studio/");

  if (isStudioRoute) return null;

  return (
    <footer className="relative z-[1] border-t border-white/10 bg-black/50 px-4 py-10 text-white" aria-label="Epic Music Space footer">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <section>
          <p className="studio-label text-tube-300">Epic Music Space</p>
          <h2 className="mt-2 max-w-xl font-display text-2xl uppercase tracking-wider text-white">Music creation, live collaboration, licensing, and fan discovery in one studio-grade platform.</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60">Artists keep their masters. Fans discover early. Producers and engineers sell services. EMS uses transparent platform fees, public license education, and secure checkout flows to build long-term trust.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-widest text-white/65">
            <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100">Artist-owned masters</span>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-cyan-100">Secure sessions</span>
            <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-amber-100">Transparent licensing</span>
          </div>
        </section>
        <nav aria-label="Platform links">
          <p className="studio-label mb-3 text-white/45">Platform</p>
          <ul className="space-y-2 text-sm text-white/70">
            {platformLinks.map((link) => <li key={link.href}><Link className="hover:text-tube-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" href={link.href}>{link.label}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Trust and legal links">
          <p className="studio-label mb-3 text-white/45">Trust + Legal</p>
          <ul className="space-y-2 text-sm text-white/70">
            {trustLinks.map((link) => <li key={link.href}><Link className="hover:text-tube-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" href={link.href}>{link.label}</Link></li>)}
          </ul>
        </nav>
      </div>
      <div className="mx-auto mt-8 flex max-w-6xl flex-col gap-2 border-t border-white/10 pt-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Epic Music Space. All rights reserved.</p>
        <p>Production platform status: consumer experience, studio tools, marketplace, licensing, and creator trust flows.</p>
      </div>
    </footer>
  );
}
