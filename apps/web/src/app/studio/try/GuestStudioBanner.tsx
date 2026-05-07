"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Top banner shown to anonymous visitors on /studio/try. Conveys two
 * things at a glance: (1) "yes, this is the real thing" — and (2) "we'll
 * ask for your email when you have something worth keeping, not before."
 * Dismissible per-session via localStorage so it doesn't nag returning
 * tire-kickers.
 */
export default function GuestStudioBanner() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("ems-guest-banner-dismissed-v1") === "1"; }
    catch { return false; }
  });

  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    try { window.localStorage.setItem("ems-guest-banner-dismissed-v1", "1"); }
    catch { /* private browsing */ }
  }

  return (
    <div
      role="region"
      aria-label="Guest mode banner"
      className="sticky top-0 z-30 border-b border-amber-400/30 bg-gradient-to-r from-amber-400/15 via-fuchsia-500/10 to-cyan-400/15 px-4 py-2.5 text-sm backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <span aria-hidden className="hidden text-base sm:inline">🎚️</span>
        <p className="flex-1 text-white/85">
          <span className="font-bold text-white">Guest mode.</span>{" "}
          <span className="text-white/70">
            Make beats, record, mix — no signup required. We&apos;ll only ask for
            your email when you want to save or publish.
          </span>
        </p>
        <Link
          href="/auth/signup?role=ARTIST&callbackUrl=%2Fstudio%2Fboard"
          className="hidden flex-shrink-0 rounded-lg bg-gradient-to-r from-amber-400 to-fuchsia-500 px-3 py-1.5 text-xs font-extrabold text-black hover:opacity-90 sm:inline-block"
        >
          Sign up free →
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss guest banner"
          className="flex-shrink-0 rounded-md p-1 text-white/55 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
