"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Smart app download banner.
 *
 * - Only shows on mobile browsers (iOS Safari / Android Chrome).
 * - Never shows inside the native Capacitor app shell.
 * - Dismissed state is persisted in localStorage for 30 days.
 * - Detects iOS vs Android and links to the correct store (or /get-the-app as fallback).
 */

const DISMISS_KEY = "ems_app_banner_dismissed";
const DISMISS_DAYS = 30;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const { until } = JSON.parse(raw) as { until: number };
    return Date.now() < until;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(
      DISMISS_KEY,
      JSON.stringify({ until: Date.now() + DISMISS_DAYS * 86_400_000 }),
    );
  } catch {}
}

function detectMobilePlatform(): "ios" | "android" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}

function isInsideNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

export default function AppDownloadBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    if (isInsideNativeApp()) return;
    if (isDismissed()) return;
    const p = detectMobilePlatform();
    if (!p) return;
    setPlatform(p);
    setVisible(true);
  }, []);

  if (!visible) return null;

  const storeHref =
    platform === "ios"
      ? "https://apps.apple.com/app/epic-music-space/id0000000000" // replace with real App Store ID
      : platform === "android"
        ? "https://play.google.com/store/apps/details?id=com.epicmusicspace.app" // replace with real Play Store ID
        : "/get-the-app";

  const storeLabel = platform === "ios" ? "App Store" : "Google Play";

  return (
    <div
      role="banner"
      aria-label="Download the Epic Music Space app"
      className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 z-40 flex items-center gap-3 bg-[#0d0d14] border-t border-white/10 px-4 py-3 shadow-2xl md:hidden"
    >
      {/* App icon */}
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/20">
        <svg
          aria-hidden="true"
          className="h-6 w-6 text-accent-300"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
        </svg>
      </div>

      {/* Copy */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-none text-white">Epic Music Space</p>
        <p className="mt-0.5 text-xs text-white/50">Free on the {storeLabel}</p>
      </div>

      {/* CTA */}
      <Link
        href={storeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
        onClick={() => {
          dismiss();
          setVisible(false);
        }}
      >
        Get App
      </Link>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss app download banner"
        onClick={() => {
          dismiss();
          setVisible(false);
        }}
        className="flex-shrink-0 text-white/30 hover:text-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
