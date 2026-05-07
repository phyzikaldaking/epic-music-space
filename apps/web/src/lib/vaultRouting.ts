/**
 * Pure routing-decision logic for the Vault upload entry point.
 *
 * /vault/new is the single CTA target for "drop a tape in the vault."
 * Older artists arriving here in any auth state must always land on
 * a working surface — never the home page, never a dead-end. The route
 * decides where to send them based on session + studio state, and this
 * function is the single, unit-testable owner of that decision.
 *
 * The fix to keep this from regressing: any new branch in the routing
 * matrix has to land here AND ship with a test. The page wrapper
 * (/vault/new/page.tsx) just calls `decideVaultEntry` and `redirect()`s.
 */

export type VaultViewerSession =
  | { signedIn: false }
  | {
      signedIn: true;
      role: string; // "ARTIST" | "LISTENER" | "PRODUCER" | ...
      hasStudio: boolean;
    };

export interface VaultEntryDecision {
  /** Absolute path to redirect to. Always a working destination. */
  redirectTo: string;
  /** Short label so the page can log / observe which branch fired. */
  branch:
    | "logged-out"
    | "needs-artist-role"
    | "needs-studio"
    | "go-to-upload";
}

/**
 * Build the URL chain that lets the legacy flag survive every redirect.
 * The deepest destination is `/studio/new?legacy=1&from=vault`. Any
 * intermediate step (signup, studio setup) wraps it as a `next` /
 * `callbackUrl` so the artist arrives where they intended without the
 * Vault context being silently dropped.
 */
const UPLOAD_TARGET = "/studio/new?legacy=1&from=vault";

function setupChain(): string {
  return `/studio/setup?next=${encodeURIComponent(UPLOAD_TARGET)}`;
}

function signupChain(): string {
  return (
    "/auth/signup?role=ARTIST&callbackUrl=" + encodeURIComponent(setupChain())
  );
}

export function decideVaultEntry(viewer: VaultViewerSession): VaultEntryDecision {
  if (!viewer.signedIn) {
    return { branch: "logged-out", redirectTo: signupChain() };
  }

  // Authoritative signal: do they have a studio? Any signed-in user with
  // a studio is a creator who can upload, regardless of their `role` enum
  // value (it might be LISTENER if they signed up casually, PRODUCER if
  // they were beta-flagged, etc.). Anyone signed in WITHOUT a studio gets
  // sent to setup — which now promotes their role to ARTIST as part of
  // saving the form. This breaks the prior loop where a LISTENER would
  // bounce between signup and setup forever, and most importantly never
  // dumps an authenticated user on the "Create account" page.
  if (!viewer.hasStudio) {
    const isArtistish =
      viewer.role === "ARTIST" || viewer.role === "LABEL" || viewer.role === "ADMIN";
    return {
      branch: isArtistish ? "needs-studio" : "needs-artist-role",
      redirectTo: setupChain(),
    };
  }

  return { branch: "go-to-upload", redirectTo: UPLOAD_TARGET };
}
