"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { MOBILE_TABS } from "@/lib/navigation";

/**
 * Mobile-only bottom tab bar. Hidden on md+ where the top navbar takes over.
 * Sits above the global player bar via z-stacking — the player adds 64px
 * of bottom padding to <main> on mobile so this doesn't overlap content.
 */
export default function MobileBottomNav() {
  const pathname = usePathname() ?? "/";
  useSession();

  return (
    <nav
      aria-label="Mobile navigation"
      className="studio-nav fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <span aria-hidden className="studio-walnut absolute inset-x-0 top-0 h-1" />
      <ul className="relative flex">
        {MOBILE_TABS.map((item) => {
          const active = pathname === item.href
            || pathname.startsWith(`${item.href}/`)
            || (item.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                data-ui-sfx="page"
                className={`studio-label relative flex flex-col items-center gap-0.5 px-1 py-2 transition ${
                  active ? "text-tube-400" : "text-white/50 hover:text-white"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {/* Active-channel LED — sits above the icon, like a lit
                    "selected" indicator on a hardware mixer. */}
                <span
                  aria-hidden
                  className={`absolute top-1 h-1 w-1 rounded-full ${active ? "led-on-amber" : "led-off"}`}
                />
                <span
                  aria-hidden
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                    active
                      ? "border-tube-400/50 bg-tube-400/15 text-tube-200"
                      : "border-white/15 bg-white/5 text-white/65"
                  }`}
                >
                  {item.navChip ?? item.label.slice(0, 2)}
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
