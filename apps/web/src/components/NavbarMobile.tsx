"use client";

import { useState } from "react";
import Link from "next/link";

interface NavLink {
  href: string;
  label: string;
  className?: string;
}

interface Props {
  links: NavLink[];
  isLoggedIn: boolean;
  userInitial: string;
  userName: string;
}

export default function NavbarMobile({ links, isLoggedIn, userInitial, userName }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — only visible on mobile */}
      <button
        type="button"
        aria-label="Toggle menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:bg-white/8 hover:text-white md:hidden"
      >
        {open ? (
          // X icon
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Hamburger icon
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-white/8 bg-[#0a0a0a]/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${link.className ?? "text-white/60 hover:bg-white/6 hover:text-white"}`}
              >
                {link.label}
              </Link>
            ))}

            {isLoggedIn ? (
              <>
                <div className="my-2 border-t border-white/8" />
                <div className="flex items-center gap-2.5 px-4 py-2">
                  <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400">
                    {userInitial}
                  </div>
                  <span className="text-sm text-white/55">{userName}</span>
                </div>
                <form action="/api/auth/signout" method="POST">
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-white/15 px-4 py-2.5 text-sm text-left text-white/70 hover:bg-white/8 transition"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="my-2 border-t border-white/8" />
                <Link
                  href="/auth/signin"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/70 hover:bg-white/8 hover:text-white transition text-center"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 text-center glow-purple-sm"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
