"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ClientOnlyDynamics } from "@/components/ClientDynamics";

const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"));
const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"));
const ChatbotWidget = dynamic(() => import("@/components/ChatbotWidget"));
const InstallAppPrompt = dynamic(() => import("@/components/InstallAppPrompt"));
const CookieConsent = dynamic(() => import("@/components/CookieConsent"));
const GlobalAudioPlayer = dynamic(() => import("@/components/GlobalAudioPlayer"));
// Always declare these as dynamic — branching at module-init between
// `dynamic(...)` and a stub function returns inconsistently-shaped
// values that Next.js 16's RSC bundler resolves to undefined, surfacing
// as "Element type is invalid. Lazy element resolves to undefined" + a
// BAILOUT_TO_CLIENT_SIDE_RENDERING crash on the homepage. Letting the
// dynamic loader handle non-prod gating below keeps the lazy element
// shape stable.
const VercelAnalytics = dynamic(
  () => import("@vercel/analytics/next").then((m) => m.Analytics),
  { ssr: false },
);
const VercelSpeedInsights = dynamic(
  () => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights),
  { ssr: false },
);

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export default function DeferredGlobalWidgets() {
  const [ready, setReady] = useState(false);
  const pathname = usePathname() ?? "";
  const isImmersiveStudio =
    pathname === "/studio" ||
    pathname === "/studio/try" ||
    pathname.startsWith("/studio/try/");
  const isCrowdedScrollPage =
    pathname === "/timeline" ||
    pathname.startsWith("/timeline/") ||
    pathname === "/marketplace" ||
    pathname.startsWith("/marketplace/");

  useEffect(() => {
    if (!IS_PRODUCTION) return;

    const win = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 1800 });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(id);
  }, []);

  if (!IS_PRODUCTION) return null;
  if (!ready) return null;

  const analytics = process.env.NODE_ENV === "production" ? (
    <>
      <VercelAnalytics />
      <VercelSpeedInsights />
    </>
  ) : null;

  if (isImmersiveStudio) {
    return <>{analytics}</>;
  }

  return (
    <>
      <GlobalAudioPlayer />
      <MobileBottomNav />
      <OfflineBanner />
      {!isCrowdedScrollPage && <OnboardingTour />}
      {!isCrowdedScrollPage && <KeyboardShortcuts />}
      <CookieConsent />
      {!isCrowdedScrollPage && <ChatbotWidget />}
      {!isCrowdedScrollPage && <InstallAppPrompt />}
      {!isCrowdedScrollPage && <ClientOnlyDynamics />}
      {analytics}
    </>
  );
}
