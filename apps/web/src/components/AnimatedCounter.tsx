"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: string;
  className?: string;
}

export default function AnimatedCounter({ value, className = "" }: AnimatedCounterProps) {
  const [display, setDisplay] = useState("0");
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Extract numeric part and suffix/prefix
    const prefix = value.startsWith("$") ? "$" : "";
    const stripped = value.replace(/[$+]/g, "");
    const suffix = value.endsWith("+") ? "+" : "";

    const numericStr = stripped.replace(/[KMB]/g, "");
    const multiplier =
      stripped.includes("M") ? 1_000_000
      : stripped.includes("K") ? 1_000
      : 1;
    const target = parseFloat(numericStr) * multiplier;

    if (isNaN(target)) {
      setDisplay(value);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1800;
          const startTime = performance.now();

          function easeOutCubic(t: number): number {
            return 1 - Math.pow(1 - t, 3);
          }

          function tick(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            const current = target * eased;

            let formatted: string;
            if (target >= 1_000_000) {
              formatted = `${prefix}${(current / 1_000_000).toFixed(1)}M${suffix}`;
            } else if (target >= 1_000) {
              formatted = `${prefix}${(current / 1_000).toFixed(1)}K${suffix}`;
            } else {
              formatted = `${prefix}${Math.round(current)}${suffix}`;
            }
            setDisplay(formatted);

            if (progress < 1) {
              requestAnimationFrame(tick);
            } else {
              setDisplay(value);
            }
          }

          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
