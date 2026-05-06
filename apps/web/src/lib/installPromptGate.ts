// Pure gating logic for the PWA install prompt. Lives outside the
// component so it can be unit-tested without jsdom — vitest is configured
// for node-only and only picks up files under src/lib.

export const INSTALL_PROMPT_STORAGE_KEY = "ems_install_prompt_dismissed_at";
export const INSTALL_PROMPT_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 7;

export interface InstallPromptEnv {
  /** ms since epoch to test against the dismissal stamp. */
  now: number;
  /** Last dismissal stamp from storage (raw string), or null if absent. */
  lastDismissedRaw: string | null;
  /** True when the page is running as an installed PWA. */
  isStandalone: boolean;
  /** True for iOS Safari. iOS Safari doesn't fire beforeinstallprompt — the
   *  iOS branch shows manual Add-to-Home-Screen instructions instead. */
  isIOS: boolean;
  /** Number of routes the user has visited this session. iOS prompt waits
   *  for the user to settle in a bit before nagging about install. */
  routeVisitsThisSession: number;
}

export type InstallPromptDecision =
  | { kind: "hidden" }
  | { kind: "ios" }
  | { kind: "android" };

/** Returns whether the dismissal stamp is still inside the cool-down window. */
export function withinCoolDown(env: Pick<InstallPromptEnv, "now" | "lastDismissedRaw">): boolean {
  if (!env.lastDismissedRaw) return false;
  const ts = Number(env.lastDismissedRaw);
  if (!Number.isFinite(ts)) return false;
  return env.now - ts < INSTALL_PROMPT_COOLDOWN_MS;
}

/**
 * Decide what (if anything) the install prompt should render.
 *
 * Rules:
 * - Already-installed users (display-mode: standalone) → never prompt.
 * - Recently-dismissed users → never prompt for COOLDOWN_MS.
 * - iOS Safari → "ios" if user has visited at least 2 routes this session
 *   (so we don't nag first-time landers). The component will then render
 *   the manual Add-to-Home-Screen card, since iOS doesn't fire the event.
 * - Everywhere else → "android" path. The component still has to wait for
 *   the actual `beforeinstallprompt` event before showing the card; this
 *   function just says "you're allowed to listen for it."
 */
export function decideInstallPrompt(env: InstallPromptEnv): InstallPromptDecision {
  if (env.isStandalone) return { kind: "hidden" };
  if (withinCoolDown(env)) return { kind: "hidden" };
  if (env.isIOS) {
    if (env.routeVisitsThisSession < 2) return { kind: "hidden" };
    return { kind: "ios" };
  }
  return { kind: "android" };
}
