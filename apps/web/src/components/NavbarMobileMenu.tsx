"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  icon?: string;
  description?: string;
}

interface Props {
  publicLinks: NavLink[];
  authedLinks: NavLink[];
}

const FOOTER_LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/profile/edit", label: "Profile", icon: "👤" },
  { href: "/settings/notifications", label: "Notifications", icon: "🔔" },
  { href: "/settings/privacy", label: "Privacy & data", icon: "🔒" },
  { href: "/support", label: "Support", icon: "❓" },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/dmca", label: "DMCA" },
];

export default function NavbarMobileMenu({ publicLinks, authedLinks }: Props) {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname() ?? "/";
  const isLoggedIn = !!session;
  const navLinks = isLoggedIn ? authedLinks : publicLinks;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close the panel whenever the route changes — otherwise a tap-through
  // leaves the menu visually open until the user re-taps the button.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = (session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "?").toUpperCase();
  const userImage = session?.user?.image ?? null;

  return (
    <div className="md:hidden">
      {open ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          aria-expanded="true"
          aria-controls="mobile-nav"
          onClick={() => setOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/60 transition hover:border-white/24 hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls="mobile-nav"
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 text-white/60 transition hover:border-white/24 hover:bg-white/6 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      )}

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/65 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* Slide-in side panel — full-bleed on phones, capped on tablets */}
      <nav
        id="mobile-nav"
        aria-label="Mobile navigation"
        className={`fixed inset-y-0 right-0 z-50 flex w-[88vw] max-w-sm flex-col overflow-hidden border-l border-white/10 bg-[#0a0a0e] shadow-[0_0_60px_rgba(124,58,237,0.25)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Decorative gradient header */}
        <div className="relative overflow-hidden border-b border-white/8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,0.45),transparent_55%),radial-gradient(circle_at_85%_70%,rgba(0,245,255,0.32),transparent_55%),linear-gradient(135deg,#0c0a18,#070713)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.04)_0_2px,transparent_2px_18px)] mix-blend-screen"
          />
          <div className="relative flex items-center justify-between gap-3 px-5 pb-5 pt-6">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-500/40 bg-brand-500/20 text-accent-300 shadow-[0_0_24px_rgba(124,58,237,0.35)]">
                <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
                </svg>
              </span>
              <span className="text-gradient-ems">Epic Music Space</span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/4 text-white/65 hover:bg-white/8 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* User chip (signed in) or CTAs (signed out) */}
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="relative mx-5 mb-5 flex items-center gap-3 rounded-2xl border border-white/12 bg-white/4 p-3 text-left backdrop-blur transition hover:bg-white/8"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 text-base font-black">
                {userImage ? (
                  <Image src={userImage} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {session?.user?.name ?? session?.user?.email ?? "Your account"}
                </p>
                <p className="text-[10px] uppercase tracking-widest text-white/45">
                  Tap to open dashboard
                </p>
              </div>
              <span aria-hidden className="text-lg text-white/35">›</span>
            </Link>
          ) : (
            <div className="relative mx-5 mb-5 grid grid-cols-2 gap-2">
              <Link
                href="/auth/signin"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-xl border border-white/15 bg-white/4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/8"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-500/35 hover:bg-brand-600"
              >
                Get started
              </Link>
            </div>
          )}
        </div>

        {/* Scrollable nav body */}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <ul className="flex flex-col gap-1 px-3 py-3" role="list">
            {navLinks.map((link) => {
              const active =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(`${link.href}/`));
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                      active
                        ? "bg-gradient-to-r from-brand-500/22 via-brand-500/10 to-transparent text-white shadow-[inset_0_0_0_1px_rgba(124,58,237,0.45)]"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base ${
                        active
                          ? "bg-brand-500/30 ring-1 ring-brand-400/45"
                          : "bg-white/5 ring-1 ring-white/10"
                      }`}
                    >
                      {link.icon ?? "•"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{link.label}</span>
                      {link.description && (
                        <span className="block truncate text-[11px] text-white/45">
                          {link.description}
                        </span>
                      )}
                    </span>
                    {active && (
                      <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-accent-400 shadow-[0_0_10px_rgba(0,245,255,0.85)]" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Account row (signed in only) */}
          {isLoggedIn && (
            <>
              <div className="mx-5 my-2 border-t border-white/8" />
              <p className="px-5 pt-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/40">
                Account
              </p>
              <ul className="flex flex-col gap-0.5 px-3 py-2" role="list">
                {FOOTER_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
                    >
                      <span aria-hidden className="text-base">
                        {link.icon}
                      </span>
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void signOut({ callbackUrl: "/" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10"
                  >
                    <span aria-hidden className="text-base">↩</span>
                    <span>Sign out</span>
                  </button>
                </li>
              </ul>
            </>
          )}

          {/* Footer / legal */}
          <div className="mx-5 mb-5 mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/8 pt-4 text-[11px] text-white/35">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="hover:text-white/70">
                {l.label}
              </Link>
            ))}
            <span aria-hidden>·</span>
            <span>EMS · v1</span>
          </div>
        </div>
      </nav>
    </div>
  );
}
