"use client";

import { useEffect, useState } from "react";
import CapacitorBridge from "@/components/CapacitorBridge";
import AppDownloadBanner from "@/components/AppDownloadBanner";

export function ClientOnlyDynamics() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 1800);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;

  return (
    <>
      <CapacitorBridge />
      <AppDownloadBanner />
    </>
  );
}
