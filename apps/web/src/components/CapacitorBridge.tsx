"use client";

import { useEffect } from "react";

/**
 * Mounts the Capacitor native bridge listeners.
 * Rendered as a client component inside the root layout so it runs once
 * on app boot. Has no visible output — purely side-effects.
 */
export default function CapacitorBridge() {
  useEffect(() => {
    import("@/lib/capacitor").then(({ initCapacitorBridge }) => {
      initCapacitorBridge();
    });
  }, []);

  return null;
}
