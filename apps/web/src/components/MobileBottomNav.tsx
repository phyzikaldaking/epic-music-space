"use client";

import { useEffect, useState } from "react";
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
  { href: "/feed", label: "Feed", icon: "🏠", match: (p) => p === "/feed" || p.startsWith("/post/") },
  { href: "/marketplace", label: "Tracks", icon: "🎵", match: (p) => p.startsWith("/marketplace") || p.startsWith("/track/") },
  { href: "/messages", label: "DMs", icon: "💬", match: (p) => p.startsWith("/messages") },
  { href: "/notifications", label: "Alerts", icon: "🔔" },
  { href: "/dashboard", label: "Me", icon: "👤", match: (p) => p.startsWith("/dashboard") || p.startsWith("/profile") || p.startsWith("/settings") },
];

const ANON_ITEMS: NavItem[] = [
  { href: "/feed", label: "Feed", icon: "🏠" },
  { href: "/marketplace", label: "Tracks", icon: "🎵" },
  { href: "/search", label: "Search", icon: "🔍" },
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
  const [dmUnread, setDmUnread] = useState(0);

  // Lightweight unread poll for the DM tab. 30s interval matches the
  // notification bell upstairs; the channel subscription on /messages/[id]
  // takes over realtime once the user opens a thread.
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/conversations/unread-count");
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: number };
        if (!cancelled) setDmUnread(data.unread ?? 0);
      } catch {
        /* ignore — keep last value */
      }
    }
    void fetchCount();
    const t = setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session?.user?.id]);

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
                className={`relative flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-bold uppercase tracking-widest transition ${
                  active ? "text-brand-400" : "text-white/55 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span aria-hidden className="text-lg">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.href === "/messages" && dmUnread > 0 && (
                  <span
                    aria-label={`${dmUnread} unread message${dmUnread === 1 ? "" : "s"}`}
                    className="absolute right-3 top-1 min-w-[16px] rounded-full bg-brand-500 px-1 text-[9px] font-black leading-4 text-white"
                  >
                    {dmUnread > 99 ? "99+" : dmUnread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
