"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "ems-cookie-consent";

export default function CookieConsent() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) setShown(true);
    } catch {
      // Storage blocked — show the banner anyway, dismiss is in-memory only.
      setShown(true);
    }
  }, []);

  function persist(value: "accepted" | "rejected") {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    setShown(false);
    // Tell any analytics components to opt-in/out. Components listening for
    // this event can flip their tracker on/off without a page reload.
    window.dispatchEvent(new CustomEvent("ems:consent", { detail: value }));
  }

  if (!shown) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#0d0d14]/95 p-4 shadow-2xl backdrop-blur-md sm:left-auto sm:right-6 sm:bottom-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-white/75">
          <p id="cookie-consent-title" className="font-semibold text-white">
            We use cookies
          </p>
          <p className="mt-0.5 text-white/55">
            Auth cookies are essential. We&apos;d also like to use analytics to
            improve the app — your call.{" "}
            <Link href="/legal/privacy" className="text-brand-300 hover:underline">
              Privacy policy
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => persist("rejected")}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => persist("accepted")}
            className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-brand-600"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
