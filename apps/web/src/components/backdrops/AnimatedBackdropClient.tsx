"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const AnimatedBackdrop = dynamic(() => import("./AnimatedBackdrop"), {
  ssr: false,
});

type Props = {
  variant: "hero" | "versus" | "vault";
  className?: string;
};

/**
 * Idle-gated wrapper. The canvas backdrop allocates a particle simulation
 * + a requestAnimationFrame loop, both of which compete with the browser
 * for first paint. We defer the mount until requestIdleCallback fires
 * (or 1.2s worst-case) so LCP isn't held back by eye candy. Reduced-motion
 * users skip it entirely.
 */
export default function AnimatedBackdropClient(props: Props) {
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const w = window as IdleWindow;

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setShouldMount(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setShouldMount(true), 800);
    return () => window.clearTimeout(t);
  }, []);

  if (!shouldMount) return null;
  return <AnimatedBackdrop {...props} />;
}
