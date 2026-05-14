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
      aria-describedby="cookie-consent-copy"
      className="fixed bottom-[calc(74px+env(safe-area-inset-bottom))] left-3 right-[4.75rem] z-40 rounded-lg border border-white/10 bg-[#0d0d14]/92 px-2.5 py-2 shadow-xl shadow-black/30 backdrop-blur-md sm:bottom-4 sm:left-auto sm:right-4 sm:w-[22rem]"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p id="cookie-consent-title" className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
            Cookies
          </p>
          <p id="cookie-consent-copy" className="mt-0.5 text-[11px] leading-snug text-white/55">
            Essential auth stays on. Analytics is optional. {" "}
            <Link href="/legal/privacy" className="text-brand-300 hover:underline">
              Privacy
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <button
            type="button"
            onClick={() => persist("rejected")}
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 transition hover:bg-white/10"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => persist("accepted")}
            className="rounded-md bg-brand-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-brand-600"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
