"use client";

import { useEffect, useRef, ReactNode } from "react";

interface AnimateInProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "fade";
  threshold?: number;
}

export default function AnimateIn({
  children,
  className = "",
  delay = 0,
  direction = "up",
  threshold = 0.15,
}: AnimateInProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const hiddenClass =
      direction === "left" || direction === "right"
        ? "reveal-hidden-left"
        : "reveal-hidden";

    const visibleClass =
      direction === "left" || direction === "right"
        ? "reveal-visible-left"
        : "reveal-visible";

    // mirror left/right
    if (direction === "right") {
      el.style.transform = "translateX(32px)";
    }

    el.classList.add(hiddenClass);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.classList.remove(hiddenClass);
            el.classList.add(visibleClass);
          }, delay);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, direction, threshold]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
