"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  navChip?: string;
  description?: string;
  activePrefixes?: string[];
}

interface Props {
  publicLinks: NavLink[];
  authedLinks: NavLink[];
}

const FOOTER_LINKS: { href: string; label: string; icon: string }[] = [
  { href: "/profile/edit", label: "Profile", icon: "PF" },
  { href: "/settings/notifications", label: "Notifications", icon: "NT" },
  { href: "/settings/privacy", label: "Privacy & data", icon: "PR" },
  { href: "/support", label: "Support", icon: "SP" },
];

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/dmca", label: "DMCA" },
];

export default function NavbarMobileMenu({ publicLinks, authedLinks }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname() ?? "/";
  const isLoggedIn = !!session;
  const navLinks = isLoggedIn ? authedLinks : publicLinks;

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
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

  // When the panel opens, move focus into it. When it closes via route change
  // or backdrop tap, the close handlers already restore focus to btnRef.
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  // Close the panel whenever the route changes — otherwise a tap-through
  // leaves the menu visually open until the user re-taps the button.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = (
    session?.user?.name?.[0] ??
    session?.user?.email?.[0] ??
    "?"
  ).toUpperCase();
  const userImage = session?.user?.image ?? null;

  function close() {
    setOpen(false);
    btnRef.current?.focus();
  }

  function handlePanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  }

  // The overlay + panel are portalled to <body> so they escape the navbar's
  // backdrop-filter stacking context, which traps position:fixed children in
  // Safari and Chrome.
  const overlay =
    mounted && open
      ? createPortal(
          <>
            <div
              className={`fixed inset-0 z-[11000] bg-black/65 backdrop-blur-sm transition-opacity duration-200 ${
                open
                  ? "opacity-100 pointer-events-auto"
                  : "opacity-0 pointer-events-none"
              }`}
              aria-hidden="true"
              onClick={close}
            />
            <nav
              id="mobile-nav"
              ref={(el) => {
                panelRef.current = el;
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              data-ui-sfx-menu="true"
              onKeyDown={handlePanelKeyDown}
              onTouchStart={(ev) => {
                touchStartX.current = ev.touches?.[0]?.clientX ?? null;
                touchDeltaX.current = 0;
              }}
              onTouchMove={(ev) => {
                if (touchStartX.current == null) return;
                const x = ev.touches?.[0]?.clientX ?? 0;
                touchDeltaX.current = x - touchStartX.current;
              }}
              onTouchEnd={() => {
                if (touchDeltaX.current > 60) close();
                touchStartX.current = null;
                touchDeltaX.current = 0;
              }}
              className={`fixed right-0 top-0 z-[11001] flex h-[100dvh] w-[88vw] max-w-sm flex-col overflow-hidden border-l border-white/10 bg-[#080808] text-[#f2ede3] shadow-[0_0_60px_rgba(0,0,0,0.6)] motion-safe:transition-transform motion-reduce:transition-none duration-300 ease-out ${
                open ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="relative overflow-hidden border-b border-white/10 bg-[#080808] pt-[env(safe-area-inset-top)]">
                <div className="relative flex items-center justify-between gap-3 px-5 pb-5 pt-6">
                  <Link
                    href="/"
                    onClick={close}
                    data-ui-sfx="page"
                    className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.2em]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center border border-[#c9a96e] font-serif text-lg italic text-[#c9a96e]">
                      E
                    </span>
                    <span>Epic Music Space</span>
                  </Link>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={close}
                    aria-label="Close menu"
                    data-ui-sfx="menu-close"
                    className="flex h-9 w-9 items-center justify-center border border-white/15 text-white/70 transition hover:border-[#c9a96e] hover:text-[#c9a96e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {isLoggedIn ? (
                  <Link
                    href="/dashboard"
                    onClick={close}
                    data-ui-sfx="page"
                    className="relative mx-5 mb-5 flex items-center gap-3 border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-[#c9a96e]/60"
                  >
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c9a96e]/60 text-base font-black text-[#c9a96e]">
                      {userImage ? (
                        <Image
                          src={userImage}
                          alt=""
                          width={44}
                          height={44}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {session?.user?.name ??
                          session?.user?.email ??
                          "Your account"}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                        Tap to open dashboard
                      </p>
                    </div>
                    <span aria-hidden className="text-lg text-[#c9a96e]/60">
                      ›
                    </span>
                  </Link>
                ) : (
                  <div className="relative mx-5 mb-5 grid grid-cols-2 gap-2">
                    <Link
                      href="/auth/signin"
                      onClick={close}
                      data-ui-sfx="page"
                      className="flex items-center justify-center border border-white/20 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white/85 hover:border-[#c9a96e] hover:text-[#c9a96e]"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/auth/signup"
                      onClick={close}
                      data-ui-sfx="page"
                      className="flex items-center justify-center bg-[#c9a96e] py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-[#080808] hover:bg-[#e0c48d]"
                    >
                      Get started
                    </Link>
                  </div>
                )}
              </div>

              {/* Scrollable nav body */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                <ul className="flex flex-col gap-1 px-3 py-3" role="list">
                  {navLinks.map((link) => {
                    const active =
                      pathname === link.href ||
                      (link.href !== "/" &&
                        pathname.startsWith(`${link.href}/`)) ||
                      (link.activePrefixes?.some((prefix) =>
                        pathname.startsWith(prefix),
                      ) ??
                        false);
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={close}
                          data-ui-sfx="page"
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 px-3 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e] ${
                            active
                              ? "bg-[#c9a96e]/10 text-[#c9a96e]"
                              : "text-white/75 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center border text-[10px] font-bold uppercase tracking-[0.12em] ${
                              active
                                ? "border-[#c9a96e]/60 text-[#c9a96e]"
                                : "border-white/10 text-white/45"
                            }`}
                          >
                            {link.navChip ?? link.label.slice(0, 2)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-bold uppercase tracking-[0.12em]">
                              {link.label}
                            </span>
                            {link.description && (
                              <span className="block truncate text-[11px] text-white/45">
                                {link.description}
                              </span>
                            )}
                          </span>
                          {active && (
                            <span
                              aria-hidden
                              className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#c9a96e]"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>

                {isLoggedIn && (
                  <>
                    <div className="mx-5 my-2 border-t border-white/8" />
                    <p className="px-5 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9a96e]">
                      Account
                    </p>
                    <ul className="flex flex-col gap-0.5 px-3 py-2" role="list">
                      {FOOTER_LINKS.map((link) => (
                        <li key={link.href}>
                          <Link
                            href={link.href}
                            onClick={close}
                            data-ui-sfx="page"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
                          >
                            <span
                              aria-hidden
                              className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-white/5 px-1 studio-label text-white/65 ring-1 ring-white/10"
                            >
                              {link.icon}
                            </span>
                            <span>{link.label}</span>
                          </Link>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          data-ui-sfx="accent"
                          onClick={() => {
                            close();
                            void signOut({ callbackUrl: "/" });
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-rec-400 transition hover:bg-rec-500/10"
                        >
                          <span
                            aria-hidden
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm bg-rec-500/10 px-1 studio-label text-rec-400 ring-1 ring-rec-500/30"
                          >
                            SO
                          </span>
                          <span>Sign out</span>
                        </button>
                      </li>
                    </ul>
                  </>
                )}

                {/* Footer / legal */}
                <div className="mx-5 mb-5 mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 pt-4 text-[10px] uppercase tracking-[0.14em] text-white/35">
                  {LEGAL_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={close}
                      data-ui-sfx="page"
                      className="hover:text-[#c9a96e]"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <span aria-hidden>·</span>
                  <span>EMS · v1</span>
                </div>
              </div>
            </nav>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="md:hidden">
      <button
        ref={btnRef}
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        data-ui-sfx={open ? "menu-close" : "menu-open"}
        aria-expanded={open ? "true" : "false"}
        aria-controls="mobile-nav"
        onClick={() => (open ? close() : setOpen(true))}
        className="relative z-[11002] flex h-10 w-10 items-center justify-center border border-white/15 text-white/85 transition hover:border-[#c9a96e] hover:text-[#c9a96e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e] active:scale-95"
      >
        {open ? (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        )}
      </button>

      {overlay}
    </div>
  );
}
