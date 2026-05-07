"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match?: (path: string) => boolean;
}

const ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠", match: (p) => p === "/" },
  { href: "/forum", label: "Forum", icon: "💬", match: (p) => p.startsWith("/forum") || p.startsWith("/timeline") || p.startsWith("/feed") || p.startsWith("/post/") },
  { href: "/versus", label: "Battles", icon: "⚔️", match: (p) => p.startsWith("/versus") || p.startsWith("/verzuz") },
  { href: "/marketplace", label: "Tracks", icon: "🎵", match: (p) => p.startsWith("/marketplace") || p.startsWith("/track/") },
  { href: "/dashboard", label: "Me", icon: "👤", match: (p) => p.startsWith("/dashboard") || p.startsWith("/profile") || p.startsWith("/settings") || p.startsWith("/messages") || p.startsWith("/notifications") },
];

const ANON_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠", match: (p) => p === "/" },
  { href: "/forum", label: "Forum", icon: "💬", match: (p) => p.startsWith("/forum") || p.startsWith("/timeline") || p.startsWith("/feed") || p.startsWith("/post/") },
  { href: "/versus", label: "Battles", icon: "⚔️", match: (p) => p.startsWith("/versus") || p.startsWith("/verzuz") },
  { href: "/marketplace", label: "Tracks", icon: "🎵", match: (p) => p.startsWith("/marketplace") || p.startsWith("/track/") },
  { href: "/auth/signin", label: "Sign in", icon: "→" },
];

/**
 * Mobile-only bottom tab bar. Hidden on md+ where the top navbar takes over.
 * Sits above the global player bar via z-stacking — the player adds 64px
 * of bottom padding to <main> on mobile so this doesn't overlap content.
 */
export default function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const items = session ? ITEMS : ANON_ITEMS;

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/8 bg-[#0a0a0a]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        {items.map((item) => {
          const active = item.match
            ? item.match(pathname)
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                data-ui-sfx="page"
                className={`relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
                  active ? "text-brand-400" : "text-white/55 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span aria-hidden className="text-lg">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
