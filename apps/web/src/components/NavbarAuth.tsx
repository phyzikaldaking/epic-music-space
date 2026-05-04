"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import NotificationBell from "@/components/NotificationBell";
import SignOutButton from "@/components/SignOutButton";

export default function NavbarAuth() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-9 w-24" aria-hidden="true" />;
  }

  if (!session) {
    return (
      <>
        <Link
          href="/auth/signin"
          className="hidden rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
        >
          Sign in
        </Link>
        <Link
          href="/auth/signup"
          className="hidden rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 glow-purple-sm sm:inline-flex"
        >
          Get started
        </Link>
      </>
    );
  }

  const initial = (session.user?.name ?? session.user?.email ?? "?")[0]?.toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <NotificationBell />
      <div className="hidden md:flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400">
          {initial}
        </div>
        <span className="text-sm text-white/55">
          {session.user?.name ?? session.user?.email}
        </span>
      </div>
      <Link
        href="/profile/edit"
        className="hidden rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:inline-flex"
      >
        Profile
      </Link>
      <SignOutButton />
    </div>
  );
}
