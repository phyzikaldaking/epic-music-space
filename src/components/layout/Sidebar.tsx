"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Search,
  Library,
  Heart,
  Upload,
  LayoutDashboard,
  ShoppingBag,
  Rocket,
  Music,
  X,
  Menu,
  LogIn,
  LogOut,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const publicNavItems = [
  { href: "/feed", icon: Home, label: "Discover" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/marketplace", icon: ShoppingBag, label: "Marketplace" },
];

const authNavItems = [
  { href: "/upload", icon: Upload, label: "Upload" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/liked", icon: Heart, label: "Liked Songs" },
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, profile, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
    router.refresh();
  };

  const NavLink = ({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
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
  };

  const nav = (
    <nav className="flex flex-col h-full p-4 gap-1">
      {/* Logo */}
      <Link href="/feed" className="flex items-center gap-2 px-3 py-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
          <Music size={16} className="text-white" />
        </div>
        <span className="font-bold text-white text-lg hidden md:block">EMS</span>
        <span className="font-bold text-white text-lg md:hidden">🚀</span>
      </Link>

      {/* Public nav */}
      <div className="flex-1 space-y-1">
        {publicNavItems.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}

        {user && (
          <>
            <div className="my-2 border-t border-white/10" />
            {authNavItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </>
        )}

        {/* 3D World teaser */}
        <div className="my-2 border-t border-white/10" />
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 cursor-not-allowed select-none">
          <Rocket size={20} className="flex-shrink-0" />
          <span className="hidden md:flex items-center gap-2">
            3D City
            <span className="text-xs bg-purple-600/30 text-purple-400 px-1.5 py-0.5 rounded-full">Soon</span>
          </span>
        </div>
      </div>

      {/* User section */}
      <div className="mt-auto space-y-1">
        {user ? (
          <>
            <Link
              href={`/${profile?.username ?? "profile"}`}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-all"
            >
              <UserCircle2 size={20} className="flex-shrink-0" />
              <span className="hidden md:block truncate max-w-[110px]">{profile?.display_name ?? profile?.username}</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut size={20} className="flex-shrink-0" />
              <span className="hidden md:block">Sign out</span>
            </button>
          </>
        ) : (
          <>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <LogIn size={20} />
              <span className="hidden md:block">Sign in</span>
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/40 transition-all"
            >
              <span className="hidden md:block">Get started</span>
              <span className="md:hidden">+</span>
            </Link>
          </>
        )}
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

