"use client";

import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ToastProvider } from "@/contexts/ToastContext";
import SentryUserBridge from "@/components/SentryUserBridge";
import UISfxController from "@/components/UISfxController";

export default function Providers({ children }: { children: React.ReactNode }) {
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
