"use client";

import { usePathname } from "next/navigation";

import EmsMainMenu from "@/components/navigation/EmsMainMenu";
import EmsMobileBottomNav from "@/components/navigation/EmsMobileBottomNav";

const fullscreenRoutes = new Set(["/studio/try"]);

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullscreen = fullscreenRoutes.has(pathname);

  return (
    <>
      {!fullscreen && <EmsMainMenu />}
      {children}
      {!fullscreen && <EmsMobileBottomNav />}
    </>
  );
}
