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
import DeferredGlobalWidgets from "@/components/DeferredGlobalWidgets";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute =
    !pathname || pathname === "/auth" || pathname.startsWith("/auth/");
  const isHomepage = pathname === "/";
  const isImmersiveStudio =
    pathname === "/studio" ||
    pathname === "/studio/try" ||
    pathname?.startsWith("/studio/try/");

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
              {!isHomepage && <DeferredGlobalWidgets />}
            </>
          )}
        </ToastProvider>
      </PlayerProvider>
    </SessionProvider>
  );
}
