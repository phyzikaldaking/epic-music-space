/**
 * Cloudflare Turnstile verifier — bot gate for sign-in / sign-up.
 *
 * Graceful degradation: if `TURNSTILE_SECRET_KEY` isn't set in the
 * environment we skip verification and return `{ ok: true }`. That keeps
 * local development unblocked and lets the gate roll out behind a single
 * env var instead of being load-bearing on day one.
 *
 * Once configured, every credential sign-in / register call should pass
 * the client-side token through to `verifyTurnstileToken()` before doing
 * any DB work.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

export type TurnstileResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: string };

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();

  // Not configured → don't block. Logged once-per-cold-start in dev so
  // it's obvious the gate isn't actually live yet.
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      logSkippedOnce();
    }
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== "string") {
    return { ok: false, reason: "Missing Turnstile token. Refresh and try again." };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
    });
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // Hard 5s timeout — we don't want a bad CF status to block sign-in.
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (data.success === true) return { ok: true };

    const codes = data["error-codes"]?.join(", ") ?? "unknown";
    return { ok: false, reason: `Turnstile rejected the request (${codes}).` };
  } catch (err) {
    // Treat a verifier outage as fail-open in production so a CF blip
    // doesn't lock everyone out of sign-in. The rate-limiter + bcrypt
    // timing parity from auth.ts still apply.
    console.warn("[turnstile] verify request failed", err);
    return { ok: true };
  }
}

let warned = false;
function logSkippedOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "[turnstile] TURNSTILE_SECRET_KEY is not set — bot gate is disabled. " +
      "Set TURNSTILE_SITE_KEY (NEXT_PUBLIC_TURNSTILE_SITE_KEY) + TURNSTILE_SECRET_KEY to enable.",
  );
}

/** Server helper: is Turnstile actually configured for this deploy? */
export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}
