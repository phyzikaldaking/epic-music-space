/**
 * Translate raw Stripe SDK errors into a (clientMessage, log payload) pair.
 *
 * Why this exists:
 *   Stripe's error messages are a mix of "this card was declined" (safe to
 *   show users) and "Please review the responses on your test accounts
 *   dashboard" (a platform-config issue that means nothing to an artist).
 *   Surfacing the raw text in either case is wrong — the first leaks
 *   internal detail, the second blames the artist for our config.
 *
 *   This helper:
 *     1) returns a short, *friendly* message safe to put in a 500/4xx body,
 *     2) returns a structured payload with `code`, `type`, `requestId`,
 *        `param` so we can grep / Sentry / dashboard them,
 *     3) tags `isPlatformConfigError` for the cases where the platform
 *        owner (us) needs to fix something — nothing the artist can do.
 */

export interface ClassifiedStripeError {
  /** Friendly text safe to render to the artist. */
  clientMessage: string;
  /** Structured detail for logs / observability. Never user-visible. */
  log: {
    code?: string;
    type?: string;
    statusCode?: number;
    requestId?: string;
    param?: string;
    raw: string;
  };
  /** True when fixing this requires a platform-level dashboard action. */
  isPlatformConfigError: boolean;
}

// Stripe error types that mean "the platform's account/dashboard is the
// problem, not the artist's input." Surfaced separately so the admin page
// can show a clear remediation.
const PLATFORM_CONFIG_TYPES = new Set([
  // Connect not enabled, capabilities missing, account in review, etc.
  "StripePermissionError",
  "StripeInvalidRequestError",
]);

const PLATFORM_CONFIG_PHRASES = [
  // The literal message Stripe returns when the platform hasn't completed
  // its own onboarding ("review the responses on your test accounts
  // dashboard"). We string-match in addition to type-checking because
  // Stripe occasionally categorizes these as plain "invalid_request_error".
  "review the responses on your test",
  "platform requirements",
  "capabilities",
  "must complete the platform profile",
  "not yet been activated",
  "account.application",
];

export function classifyStripeError(err: unknown): ClassifiedStripeError {
  if (!err || typeof err !== "object") {
    return {
      clientMessage: "Something went wrong. Please try again.",
      log: { raw: String(err) },
      isPlatformConfigError: false,
    };
  }

  // The Stripe SDK uses error subclasses with `.type`, `.code`, etc.
  const e = err as {
    name?: string;
    message?: string;
    type?: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    param?: string;
  };

  const message = e.message ?? "";
  const lower = message.toLowerCase();
  const matchesPlatformPhrase = PLATFORM_CONFIG_PHRASES.some((p) =>
    lower.includes(p),
  );
  const matchesType = e.type ? PLATFORM_CONFIG_TYPES.has(e.type) : false;
  const isPlatformConfigError = matchesPlatformPhrase || (matchesType && matchesPlatformPhrase);

  let clientMessage: string;
  if (isPlatformConfigError) {
    clientMessage =
      "Payouts setup is being completed by the platform team. Try again in a few minutes — we've been notified.";
  } else if (e.code === "rate_limit") {
    clientMessage = "Too many requests right now. Try again in a minute.";
  } else if (e.type === "StripeInvalidRequestError" && e.param) {
    // Don't echo the param to the user — it's an internal field name.
    clientMessage = "Something didn't look right with that request. Please try again.";
  } else if (e.statusCode === 401 || e.statusCode === 403) {
    clientMessage =
      "Payouts are temporarily unavailable. Try again in a few minutes.";
  } else {
    clientMessage = "Couldn't reach Stripe right now. Please try again.";
  }

  return {
    clientMessage,
    log: {
      code: e.code,
      type: e.type,
      statusCode: e.statusCode,
      requestId: e.requestId,
      param: e.param,
      raw: message,
    },
    isPlatformConfigError,
  };
}
