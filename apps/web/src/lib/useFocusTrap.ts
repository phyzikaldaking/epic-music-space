"use client";

import { useEffect, useRef, type RefObject } from "react";

/** Trap focus inside a container while it's mounted (modals + overlays).
 *  Auto-focuses the first focusable element on mount, restores focus to
 *  the previously focused element on unmount, and loops Tab/Shift+Tab
 *  inside the container (#25). The container ref must be attached to a
 *  parent that wraps every focusable child.
 *
 *  Returns the same ref so callers can stash + spread it via destructure:
 *    const ref = useFocusTrap(open);
 *    <div ref={ref} role="dialog">...
 *  When `enabled` is false the hook is a no-op so callers can keep it
 *  mounted but inert during transitions. */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  enabled: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const previouslyFocused =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;

    const focusable = (): HTMLElement[] => {
      const items = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      // Skip hidden controls — there's at least one hidden <input
      // type="file"> in the studio that should not be in the loop.
      return Array.from(items).filter((el) => {
        if (el.hasAttribute("disabled")) return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        // Element is laid out and visible.
        return el.offsetParent !== null || el === document.activeElement;
      });
    };

    // Auto-focus the first focusable child so keyboard users can act
    // without tabbing into the modal from the background.
    const first = focusable()[0];
    if (first) first.focus();

    const container: HTMLElement = root;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === firstEl || !container.contains(active)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (active === lastEl || !container.contains(active)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      // Hand focus back to whatever opened us, so closing a modal
      // returns the user to where they were.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled]);

  return ref;
}
