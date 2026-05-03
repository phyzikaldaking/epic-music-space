"use client";

import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ToastProvider } from "@/contexts/ToastContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlayerProvider>
        <ToastProvider>{children}</ToastProvider>
      </PlayerProvider>
    </SessionProvider>
  );
}
