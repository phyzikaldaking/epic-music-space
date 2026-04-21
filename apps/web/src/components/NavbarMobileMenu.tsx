"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface NavLink {
  href: string;
  label: string;
}

interface Props {
  navLinks: NavLink[];
  isLoggedIn: boolean;
}

export default function NavbarMobileMenu({ navLinks, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);

  // Close on route change / escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Hamburger button */}
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/60 transition hover:border-white/24 hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        {open ? (
          /* X icon */
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          /* Hamburger icon */
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-down drawer */}
      <nav
        id="mobile-nav"
        aria-label="Mobile navigation"
        className={`fixed left-0 right-0 top-[57px] z-50 border-b border-white/10 bg-[#0a0a0a]/98 backdrop-blur-xl transition-all duration-200 ${
          open ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-2 opacity-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto max-w-7xl px-4 py-4">
          <ul className="flex flex-col gap-1" role="list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center rounded-lg px-4 py-3 text-base font-medium text-white/70 transition hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {!isLoggedIn && (
            <div className="mt-4 flex flex-col gap-2 border-t border-white/8 pt-4">
              <Link
                href="/auth/signin"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg border border-white/15 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/6 hover:text-white"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg bg-brand-500 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 glow-purple-sm"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
