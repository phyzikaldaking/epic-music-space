"use client";

import { useEffect, useState } from "react";

/**
 * Mobile-friendly offline banner. Sits above the bottom nav (or full
 * width on desktop) when the browser reports navigator.onLine === false.
 * Reflects flaky cell signal too — fetch failures already retry, this
 * just tells the user why nothing's loading.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed inset-x-0 bottom-[72px] z-40 mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-500/15 px-4 py-2 text-xs font-bold text-yellow-100 shadow-2xl backdrop-blur md:bottom-24"
    >
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-yellow-300" />
      <span>You&apos;re offline — changes will sync when you&apos;re back.</span>
    </div>
  );
}
