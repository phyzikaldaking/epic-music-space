import type { UiSfxKind } from "@/lib/uiSfx";

const CLICK_KINDS = new Set<UiSfxKind>(["tap", "page", "menu-open", "menu-close", "accent"]);

const INPUT_LIKE_SELECTOR = "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']";
const MENU_CONTEXT_SELECTOR = "[data-ui-sfx-menu='true'], [role='menu'], [role='menubar'], [aria-activedescendant]";
const MENU_ITEM_SELECTOR = "[role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], a[href], button";

export function readSfxKindFromElement(el: HTMLElement | null): UiSfxKind | null {
  if (!el) return null;
  const node = el.closest<HTMLElement>("[data-ui-sfx]");
  if (!node) return null;
  const value = node.dataset.uiSfx as UiSfxKind | undefined;
  if (!value) return null;
  return CLICK_KINDS.has(value) ? value : null;
}

export function shouldPlayHoverTone(
  previousElement: Element | null,
  previousAtMs: number,
  currentElement: Element,
  nowMs: number,
  minIntervalMs = 120,
): boolean {
  if (previousElement === currentElement && nowMs - previousAtMs < minIntervalMs) {
    return false;
  }
  return true;
}

export function shouldPlayArrowTone(active: HTMLElement | null): boolean {
  if (!active) return false;
  if (active.matches(INPUT_LIKE_SELECTOR) || active.closest(INPUT_LIKE_SELECTOR)) return false;

  const context = active.closest(MENU_CONTEXT_SELECTOR);
  if (!context) return false;

  if (active.matches(MENU_ITEM_SELECTOR) || active.closest(MENU_ITEM_SELECTOR)) {
    return true;
  }

  const hasActivedescendant = context.getAttribute("aria-activedescendant");
  return typeof hasActivedescendant === "string" && hasActivedescendant.length > 0;
}

export function routeKindFromPath(pathname: string): UiSfxKind {
  if (pathname.startsWith("/studio")) return "page-studio";
  if (pathname.startsWith("/dashboard")) return "page-dashboard";
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/signin")
  ) {
    return "page-auth";
  }
  return "page";
}
