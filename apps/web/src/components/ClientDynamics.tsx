"use client";

import dynamic from "next/dynamic";

const CapacitorBridge = dynamic(() => import("@/components/CapacitorBridge"), { ssr: false });
const AppDownloadBanner = dynamic(() => import("@/components/AppDownloadBanner"), { ssr: false });

export function ClientOnlyDynamics() {
  return (
    <>
      <CapacitorBridge />
      <AppDownloadBanner />
    </>
  );
}
