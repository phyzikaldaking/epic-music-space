import { checkBotId } from "botid/server";

/**
 * Thin wrapper around Vercel BotID's checkBotId() that:
 *   - returns { isBot } for the caller to gate on,
 *   - swallows package failures (network blips, dev mode without
 *     BOTID_TOKEN, self-host) so we never fail open OR closed on a
 *     transient error — we treat unknown as human and let the route's
 *     own rate limiter pick up the slack.
 *
 * Wired into the highest-value abuse surfaces:
 *   - POST /api/auth/register  (signup spam)
 *   - POST /api/posts          (post spam)
 *
 * Add more callers by importing isLikelyBot() from this module.
 */
export async function isLikelyBot(): Promise<boolean> {
  try {
    const result = await checkBotId();
    if ("isBot" in result) {
      return result.isBot && !result.isVerifiedBot;
    }
    return false;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[botCheck] checkBotId failed", err);
    }
    return false;
  }
}
