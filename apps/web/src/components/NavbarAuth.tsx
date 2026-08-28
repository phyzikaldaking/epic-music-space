"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import SignOutButton from "@/components/SignOutButton";

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]";

export default function NavbarAuth() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="hidden h-9 w-24 sm:block" aria-hidden="true" />;
  }

  if (!session) {
    return (
      <div className="hidden items-center gap-4 sm:flex">
        <Link
          href="/auth/signin"
          className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d1cbc0]/65 transition hover:text-[#f2ede3] ${focusRing}`}
        >
          Sign in
        </Link>
        <Link
          href="/auth/signup"
          className={`inline-flex min-h-10 items-center bg-[#c9a96e] px-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#080808] transition hover:bg-[#e0c48d] ${focusRing}`}
        >
          Join
        </Link>
      </div>
    );
  }

  const initial = (session.user?.name ??
    session.user?.email ??
    "?")[0]?.toUpperCase();

  return (
    <div className="hidden items-center gap-3 sm:flex">
      <Link
        href="/studio/try"
        className={`inline-flex min-h-10 items-center border border-[#c9a96e]/60 px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-[#c9a96e] transition hover:bg-[#c9a96e] hover:text-[#080808] ${focusRing}`}
      >
        Studio
      </Link>
      <Link
        href="/profile/edit"
        aria-label="Edit profile"
        title={session.user?.name ?? session.user?.email ?? "Profile"}
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-xs font-bold text-[#f2ede3] transition hover:border-[#c9a96e] hover:text-[#c9a96e] ${focusRing}`}
      >
        {initial}
      </Link>
      <SignOutButton />
    </div>
  );
}
