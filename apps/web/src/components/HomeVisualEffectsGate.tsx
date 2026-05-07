"use client";

import { useEffect } from "react";

export default function HomeVisualEffectsGate() {
  useEffect(() => {
    const root = document.documentElement;
    const markReady = () => root.classList.add("vc-effects-ready");

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(markReady, { timeout: 1200 });
      return () => {
        root.classList.remove("vc-effects-ready");
        w.cancelIdleCallback?.(id);
      };
    }

    const timeout = w.setTimeout(markReady, 800);
    return () => {
      root.classList.remove("vc-effects-ready");
      w.clearTimeout(timeout);
    };
  }, []);

  return null;
}
