"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import OnboardingTour from "@/components/OnboardingTour";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import MobileBottomNav from "@/components/MobileBottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import ChatbotWidget from "@/components/ChatbotWidget";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import CookieConsent from "@/components/CookieConsent";
import { ClientOnlyDynamics } from "@/components/ClientDynamics";

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
      <OnboardingTour />
      <KeyboardShortcuts />
      <CookieConsent />
      <MobileBottomNav />
      <OfflineBanner />
      <ChatbotWidget />
      <InstallAppPrompt />
      <ClientOnlyDynamics />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
