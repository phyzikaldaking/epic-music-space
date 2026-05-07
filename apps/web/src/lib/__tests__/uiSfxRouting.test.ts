import { describe, expect, it } from "vitest";
import {
  readSfxKindFromElement,
  routeKindFromPath,
  shouldPlayArrowTone,
  shouldPlayHoverTone,
} from "@/lib/uiSfxRouting";

describe("uiSfxRouting", () => {
  it("maps route segments to specific page sounds", () => {
    expect(routeKindFromPath("/studio/board")).toBe("page-studio");
    expect(routeKindFromPath("/dashboard/wallet")).toBe("page-dashboard");
    expect(routeKindFromPath("/auth/signin")).toBe("page-auth");
    expect(routeKindFromPath("/marketplace")).toBe("page");
  });

  it("throttles hover tone for repeated entry on same element", () => {
    const node = { id: "item-a" } as unknown as Element;
    expect(shouldPlayHoverTone(null, 0, node, 1000)).toBe(true);
    expect(shouldPlayHoverTone(node, 1000, node, 1080)).toBe(false);
    expect(shouldPlayHoverTone(node, 1000, node, 1130)).toBe(true);
  });

  it("reads click sound kind from data-ui-sfx attributes", () => {
    const data = { uiSfx: "menu-open" };
    const host = {
      dataset: data,
      closest: () => ({ dataset: data }),
    } as unknown as HTMLElement;
    expect(readSfxKindFromElement(host)).toBe("menu-open");
  });

  it("rejects arrow tones in input-like contexts", () => {
    const menuContainer = {
      getAttribute: () => null,
    } as unknown as Element;

    const inputEl = {
      matches: (selector: string) => selector.includes("input"),
      closest: (selector: string) => (selector.includes("input") ? menuContainer : null),
    } as unknown as HTMLElement;

    expect(shouldPlayArrowTone(inputEl)).toBe(false);
  });

  it("allows arrow tones in marked menu contexts", () => {
    const menuContainer = {
      getAttribute: () => null,
    } as unknown as Element;

    const menuButton = {
      matches: (selector: string) => selector.includes("button"),
      closest: (selector: string) => {
        if (selector.includes("input")) return null;
        if (selector.includes("data-ui-sfx-menu")) return menuContainer;
        if (selector.includes("button")) return menuContainer;
        return null;
      },
    } as unknown as HTMLElement;

    expect(shouldPlayArrowTone(menuButton)).toBe(true);
  });
});
