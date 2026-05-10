"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
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
          className="hidden rounded-md studio-faceplate-dark px-4 py-1.5 font-display text-sm uppercase tracking-[0.14em] text-white/80 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 sm:inline-flex"
        >
          Sign in
        </Link>
        <Link
          href="/auth/signup"
          className="studio-engage-btn hidden rounded-md px-4 py-1.5 font-display text-sm uppercase tracking-[0.14em] focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 sm:inline-flex"
        >
          Get started
        </Link>
      </>
    );
  }

  const initial = (session.user?.name ?? session.user?.email ?? "?")[0]?.toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/studio"
        className="hidden rounded-md studio-faceplate-dark px-3 py-1.5 font-display text-sm uppercase tracking-[0.14em] text-white/80 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 sm:inline-flex"
      >
        Studio
      </Link>
      <div className="hidden md:flex items-center gap-2.5">
        <div className="studio-tube-bezel flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-tube-300">
          {initial}
        </div>
        <span className="text-sm text-white/65">
          {session.user?.name ?? session.user?.email}
        </span>
      </div>
      <Link
        href="/profile/edit"
        className="hidden rounded-md studio-faceplate-dark px-3 py-1.5 font-display text-sm uppercase tracking-[0.14em] text-white/75 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 sm:inline-flex"
      >
        Profile
      </Link>
      <Link
        href="/settings/notifications"
        aria-label="Notification settings"
        title="Notifications"
        className="hidden rounded-md studio-faceplate-dark px-2 py-1.5 text-sm text-white/65 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-400/50 sm:inline-flex"
      >
        ⚙
      </Link>
      <SignOutButton />
    </div>
  );
}
