"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { PlayerProvider } from "@/contexts/PlayerContext";
import { ToastProvider } from "@/contexts/ToastContext";
import SentryUserBridge from "@/components/SentryUserBridge";
import PostHogIdentityBridge from "@/components/PostHogIdentityBridge";
import UISfxController from "@/components/UISfxController";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = !pathname || pathname === "/auth" || pathname.startsWith("/auth/");
  const isImmersiveStudio = pathname === "/studio" || pathname.startsWith("/studio/");

  useEffect(() => {
    const loader = document.getElementById("__ems-loading");
    if (!loader) return;
    const hideLoader = () => {
      loader.classList.add("opacity-0", "pointer-events-none");
      loader.classList.remove("opacity-100");
      loader.setAttribute("hidden", "hidden");
      loader.setAttribute("aria-hidden", "true");
    };
    hideLoader();
  }, []);

  return (
    <SessionProvider>
      <SentryUserBridge />
      <PostHogIdentityBridge />
      <UISfxController />
      <PlayerProvider>
        <ToastProvider>
          {isAuthRoute ? (
            <main id="main-content" className="pb-12">
              {children}
            </main>
          ) : isImmersiveStudio ? (
            <>{children}</>
          ) : (
            <>
              <Navbar />
              <main id="main-content" className="pb-32 md:pb-20">
                {children}
              </main>
              <Footer />
            </>
          )}
        </ToastProvider>
      </PlayerProvider>
    </SessionProvider>
  );
}
