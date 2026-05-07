"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getUiSfx, type UiSfxKind } from "@/lib/uiSfx";

function readSfxKindFromElement(el: HTMLElement | null): UiSfxKind | null {
  if (!el) return null;
  const node = el.closest<HTMLElement>("[data-ui-sfx]");
  if (!node) return null;
  const val = node.dataset.uiSfx;
  if (val === "tap" || val === "page" || val === "menu-open" || val === "menu-close" || val === "accent") {
    return val;
  }
  return null;
}

export default function UISfxController() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const lastHoverEl = useRef<Element | null>(null);
  const lastHoverTime = useRef<number>(0);

  useEffect(() => {
    const sfx = getUiSfx();
    const onPointerDown = () => {
      void sfx.warmup();
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const kind = readSfxKindFromElement(target);
      if (!kind) return;
      void sfx.play(kind);
    };

    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const node = target?.closest<HTMLElement>("[data-ui-sfx]");
      if (!node) return;
      const now = Date.now();
      if (lastHoverEl.current === node && now - lastHoverTime.current < 120) return;
      lastHoverEl.current = node;
      lastHoverTime.current = now;
      void sfx.play("hover");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      const inNav = active.closest("nav, [role='menu'], [role='menubar'], [data-ui-sfx]");
      if (!inNav) return;
      void sfx.play(event.key === "ArrowUp" ? "arrow-up" : "arrow-down");
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("keydown", onKeyDown, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (previousPath.current === null) {
      previousPath.current = pathname;
      return;
    }
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      void getUiSfx().play("page");
    }
  }, [pathname]);

  return null;
}
