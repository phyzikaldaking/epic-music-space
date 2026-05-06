"use client";

import { useEffect, useState } from "react";
import {
  decideInstallPrompt,
  INSTALL_PROMPT_STORAGE_KEY,
} from "@/lib/installPromptGate";

// Cross-browser shape for the deferred install prompt event. The standard
// type isn't on lib.dom, so we describe just the bits we use.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectStandalone() {
  if (typeof window === "undefined") return false;
  // PWA installed on iOS Safari / Chrome / Edge / Firefox
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Older iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function detectIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

export default function InstallAppPrompt() {
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosVisible, setIosVisible] = useState(false);
  const [androidVisible, setAndroidVisible] = useState(false);

  useEffect(() => {
    const decision = decideInstallPrompt({
      now: Date.now(),
      lastDismissedRaw: window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY),
      isStandalone: detectStandalone(),
      isIOS: detectIOS(),
      routeVisitsThisSession: Number(window.sessionStorage.getItem("ems_route_visits") ?? "0"),
    });

    if (decision.kind === "hidden") return;

    if (decision.kind === "ios") {
      const t = window.setTimeout(() => setIosVisible(true), 1200);
      return () => window.clearTimeout(t);
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
      setAndroidVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INSTALL_PROMPT_STORAGE_KEY, String(Date.now()));
    }
    setIosVisible(false);
    setAndroidVisible(false);
  }

  async function install() {
    if (!deferredEvent) return;
    await deferredEvent.prompt();
    const { outcome } = await deferredEvent.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      dismiss();
    }
  }

  if (!iosVisible && !androidVisible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Epic Music Space"
      className="fixed inset-x-3 bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] z-[140] mx-auto max-w-md rounded-2xl border border-white/12 bg-gradient-to-br from-[#0e0a18]/95 via-[#080612]/95 to-[#0a0414]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-lg">
          ♫
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Add EMS to your home screen</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            {iosVisible
              ? "Tap the Share button, then “Add to Home Screen” — launches faster, full-screen, no browser bar."
              : "One-tap install. No app store, no download — just an icon for instant access."}
          </p>
          <div className="mt-3 flex gap-2">
            {androidVisible && (
              <button
                type="button"
                onClick={install}
                className="rounded-lg bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10"
            >
              {iosVisible ? "Got it" : "Not now"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="text-white/30 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
