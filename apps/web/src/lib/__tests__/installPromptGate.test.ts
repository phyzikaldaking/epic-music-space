import { describe, it, expect } from "vitest";
import {
  decideInstallPrompt,
  withinCoolDown,
  INSTALL_PROMPT_COOLDOWN_MS,
} from "../installPromptGate";

const NOW = 1_700_000_000_000;

const baseEnv = {
  now: NOW,
  lastDismissedRaw: null,
  isStandalone: false,
  isIOS: false,
  routeVisitsThisSession: 5,
};

describe("withinCoolDown", () => {
  it("false when no dismissal stamp", () => {
    expect(withinCoolDown({ now: NOW, lastDismissedRaw: null })).toBe(false);
  });

  it("false when stamp is unparseable", () => {
    expect(withinCoolDown({ now: NOW, lastDismissedRaw: "not-a-number" })).toBe(false);
  });

  it("true within cool-down window", () => {
    const recent = NOW - 1000 * 60 * 60; // 1 hour ago
    expect(withinCoolDown({ now: NOW, lastDismissedRaw: String(recent) })).toBe(true);
  });

  it("false outside cool-down window", () => {
    const stale = NOW - INSTALL_PROMPT_COOLDOWN_MS - 1;
    expect(withinCoolDown({ now: NOW, lastDismissedRaw: String(stale) })).toBe(false);
  });
});

describe("decideInstallPrompt", () => {
  it("hides when already installed", () => {
    expect(decideInstallPrompt({ ...baseEnv, isStandalone: true })).toEqual({ kind: "hidden" });
    expect(
      decideInstallPrompt({ ...baseEnv, isStandalone: true, isIOS: true }),
    ).toEqual({ kind: "hidden" });
  });

  it("hides during cool-down even on iOS", () => {
    const recent = String(NOW - 1000 * 60 * 60);
    expect(
      decideInstallPrompt({ ...baseEnv, isIOS: true, lastDismissedRaw: recent }),
    ).toEqual({ kind: "hidden" });
  });

  it("returns android by default on non-iOS", () => {
    expect(decideInstallPrompt(baseEnv)).toEqual({ kind: "android" });
  });

  it("returns ios on iOS once user has settled in (>= 2 routes)", () => {
    expect(
      decideInstallPrompt({ ...baseEnv, isIOS: true, routeVisitsThisSession: 2 }),
    ).toEqual({ kind: "ios" });
    expect(
      decideInstallPrompt({ ...baseEnv, isIOS: true, routeVisitsThisSession: 17 }),
    ).toEqual({ kind: "ios" });
  });

  it("hides on iOS for first-time landers (< 2 routes)", () => {
    expect(
      decideInstallPrompt({ ...baseEnv, isIOS: true, routeVisitsThisSession: 0 }),
    ).toEqual({ kind: "hidden" });
    expect(
      decideInstallPrompt({ ...baseEnv, isIOS: true, routeVisitsThisSession: 1 }),
    ).toEqual({ kind: "hidden" });
  });

  it("re-prompts after the cool-down expires", () => {
    const stale = String(NOW - INSTALL_PROMPT_COOLDOWN_MS - 1);
    expect(
      decideInstallPrompt({ ...baseEnv, lastDismissedRaw: stale }),
    ).toEqual({ kind: "android" });
  });
});
