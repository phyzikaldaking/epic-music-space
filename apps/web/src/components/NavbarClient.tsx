"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface NavbarClientProps {
  userName?: string | null;
  userInitial?: string;
  isLoggedIn: boolean;
}

export default function NavbarClient({ userName, userInitial, isLoggedIn }: NavbarClientProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks: Array<{ href: string; label: string; className?: string }> = [
    { href: "/marketplace", label: "Marketplace" },
    { href: "/city",        label: "City" },
    { href: "/versus",      label: "Versus" },
    { href: "/leaderboard", label: "Charts" },
    { href: "/label",       label: "Labels" },
    { href: "/ai",          label: "AI" },
    { href: "/pricing",     label: "Pricing" },
  ];

  const userLinks: Array<{ href: string; label: string; className?: string }> = isLoggedIn ? [
    { href: "/dashboard",   label: "Dashboard" },
    { href: "/profile/edit",label: "Profile" },
    { href: "/analytics",   label: "Analytics" },
    { href: "/invite",      label: "🔗 Invite",  className: "text-green-400/80 hover:text-green-400 hover:bg-green-500/10 font-semibold" },
    { href: "/boost",       label: "⚡ Boost",   className: "text-brand-400/80 hover:text-brand-400 hover:bg-brand-500/10 font-semibold" },
  ] : [];

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[#080808]/90 backdrop-blur-2xl shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
          : "border-b border-transparent bg-[#080808]/60 backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight group">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-lg glow-purple-sm border border-brand-500/30 transition-all duration-300 group-hover:bg-brand-500/30 group-hover:border-brand-500/50">
            🎵
          </span>
          <span className="text-gradient-ems font-display tracking-wide">EMS</span>
        </Link>

        {/* Desktop Nav links */}
        <div className="hidden items-center gap-0.5 text-sm font-medium md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-white/55 transition-all duration-200 hover:bg-white/6 hover:text-white relative group"
            >
              {link.label}
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-0 bg-brand-400 transition-all duration-200 group-hover:w-4/5" />
            </Link>
          ))}
          {userLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 transition-all duration-200 ${link.className ?? "text-white/55 hover:bg-white/6 hover:text-white"}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth + mobile toggle */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-500/40 to-accent-500/40 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-white">
                  {userInitial}
                </div>
                <span className="text-sm text-white/50 max-w-[120px] truncate">
                  {userName}
                </span>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="rounded-lg border border-white/12 px-4 py-1.5 text-sm hover:bg-white/7 transition-all duration-200 text-white/60 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2">
              <Link
                href="/auth/signin"
                className="rounded-lg border border-white/12 px-4 py-1.5 text-sm text-white/60 hover:bg-white/7 hover:text-white transition-all duration-200"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="btn-primary text-sm py-2 px-5"
              >
                Get started
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-lg hover:bg-white/8 transition"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <span className={`block h-0.5 w-5 bg-white/70 transition-all duration-200 ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white/70 transition-all duration-200 ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white/70 transition-all duration-200 ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/8 bg-[#080808]/95 backdrop-blur-xl px-4 py-4 flex flex-col gap-1">
          {[...navLinks, ...userLinks].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-4 py-3 text-sm transition-all ${link.className ?? "text-white/60 hover:bg-white/6 hover:text-white"}`}
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 pt-3 border-t border-white/8 flex flex-col gap-2">
            {isLoggedIn ? (
              <form action="/api/auth/signout" method="POST">
                <button type="submit" className="w-full rounded-lg border border-white/12 py-2.5 text-sm text-white/60 hover:text-white transition">
                  Sign out
                </button>
              </form>
            ) : (
              <>
                <Link href="/auth/signin" className="rounded-lg border border-white/12 py-2.5 text-sm text-center text-white/60 hover:bg-white/7 hover:text-white transition">
                  Sign in
                </Link>
                <Link href="/auth/signup" className="btn-primary text-sm text-center py-2.5">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
