"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/8 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
    >
      Sign out
    </button>
  );
}
