"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Search,
  Library,
  Heart,
  User,
  Music,
  X,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/liked", icon: Heart, label: "Liked Songs" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col h-full p-4 gap-1">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 px-3 py-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
          <Music size={16} className="text-white" />
        </div>
        <span className="font-bold text-white text-lg hidden md:block">
          EpicMusic
        </span>
        <span className="font-bold text-white text-lg md:hidden">🚀</span>
      </Link>

      {/* Nav Links */}
      <div className="flex-1 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                active
                  ? "bg-purple-600/20 text-purple-300 border border-purple-500/30"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* Bottom */}
      <div className="mt-auto hidden md:block">
        <div className="px-3 py-2 text-xs text-gray-600">
          Epic Music Space v1.0
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex w-16 md:w-56 flex-col bg-black/30 border-r border-white/10 backdrop-blur-md flex-shrink-0">
        {nav}
      </aside>

      {/* Mobile: hamburger + drawer */}
      <div className="sm:hidden fixed top-4 left-4 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-full bg-white/10 text-white"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
      </div>

      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-gray-950/95 border-r border-white/10 flex flex-col">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
