"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ToastProvider } from "@/contexts/ToastContext";
import SentryUserBridge from "@/components/SentryUserBridge";
import UISfxController from "@/components/UISfxController";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const loader = document.getElementById("__ems-loading");
    if (!loader) {
      return;
    }

    const hideLoader = () => {
      loader.classList.add("opacity-0");
      loader.classList.remove("opacity-100");
      window.setTimeout(() => {
        loader.classList.add("pointer-events-none");
        loader.setAttribute("hidden", "hidden");
        loader.setAttribute("aria-hidden", "true");
      }, 300);
    };

    loader.removeAttribute("hidden");
    loader.setAttribute("aria-hidden", "false");
    loader.classList.remove("pointer-events-none");
    loader.classList.remove("opacity-0");
    loader.classList.add("opacity-100");

    const fallbackId = window.setTimeout(hideLoader, 6000);
    hideLoader();

    return () => {
      window.clearTimeout(fallbackId);
    };
  }, []);

  return (
    <SessionProvider>
      <SentryUserBridge />
      <UISfxController />
      <PlayerProvider>
        <ToastProvider>{children}</ToastProvider>
      </PlayerProvider>
    </SessionProvider>
  );
}
