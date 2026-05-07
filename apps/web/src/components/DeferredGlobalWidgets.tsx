"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const OnboardingTour = dynamic(() => import("@/components/OnboardingTour"));
const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const OfflineBanner = dynamic(() => import("@/components/OfflineBanner"));
const ChatbotWidget = dynamic(() => import("@/components/ChatbotWidget"));
const InstallAppPrompt = dynamic(() => import("@/components/InstallAppPrompt"));
const CookieConsent = dynamic(() => import("@/components/CookieConsent"));
const ClientOnlyDynamics = dynamic(
  () => import("@/components/ClientDynamics").then((m) => m.ClientOnlyDynamics),
);
const GlobalAudioPlayer = dynamic(() => import("@/components/GlobalAudioPlayer"));
const VercelAnalytics =
  process.env.NODE_ENV === "production"
    ? dynamic(() => import("@vercel/analytics/next").then((m) => m.Analytics), { ssr: false })
    : function DisabledAnalytics() {
        return null;
      };
const VercelSpeedInsights =
  process.env.NODE_ENV === "production"
    ? dynamic(() => import("@vercel/speed-insights/next").then((m) => m.SpeedInsights), { ssr: false })
    : function DisabledSpeedInsights() {
        return null;
      };

export default function DeferredGlobalWidgets() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
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

  if (!ready) return null;

  return (
    <>
      <GlobalAudioPlayer />
      <MobileBottomNav />
      <OfflineBanner />
      <OnboardingTour />
      <KeyboardShortcuts />
      <CookieConsent />
      <ChatbotWidget />
      <InstallAppPrompt />
      <ClientOnlyDynamics />
      <VercelAnalytics />
      <VercelSpeedInsights />
    </>
  );
}
