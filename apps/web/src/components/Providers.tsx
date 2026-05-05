"use client";

import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ToastProvider } from "@/contexts/ToastContext";
import SentryUserBridge from "@/components/SentryUserBridge";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SentryUserBridge />
      <PlayerProvider>
        <ToastProvider>{children}</ToastProvider>
      </PlayerProvider>
    </SessionProvider>
  );
}
