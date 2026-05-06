import { checkBotId } from "botid/server";
import { getSiteUrl } from "@/lib/site";

type BotCheckOptions = {
  headers?: Headers;
  /**
   * When true (default), same-origin browser requests with strong human
   * client signals are allowed even if BotID reports bot. This prevents
   * locking out real users when challenge wiring is missing or flaky.
   */
  allowBrowserFallback?: boolean;
};

function toIncomingHttpHeaders(headers: Headers) {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function safeHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function looksLikeBrowser(headers?: Headers): boolean {
  if (!headers) return false;
  const ua = headers.get("user-agent") ?? "";
  if (!ua) return false;

  const obviousAutomation =
    /(bot|crawler|spider|headless|curl|wget|python|scrapy|postman|insomnia|go-http-client)/i;
  if (obviousAutomation.test(ua)) return false;
  if (!/mozilla/i.test(ua)) return false;

  const fetchMode = headers.get("sec-fetch-mode");
  const fetchSite = headers.get("sec-fetch-site");
  const hasBrowserFetchSignals =
    Boolean(fetchMode) && (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none");

  const hostHeader = (headers.get("host") ?? "").toLowerCase();
  const originHost = safeHost(headers.get("origin"));
  const refererHost = safeHost(headers.get("referer"));
  const canonicalHost = safeHost(getSiteUrl());
  const sameHost =
    (originHost && (originHost === hostHeader || originHost === canonicalHost)) ||
    (refererHost && (refererHost === hostHeader || refererHost === canonicalHost));

  return hasBrowserFetchSignals && Boolean(sameHost);
}

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
export async function isLikelyBot(options: BotCheckOptions = {}): Promise<boolean> {
  try {
    const result = await checkBotId({
      advancedOptions: {
        checkLevel: "basic",
        headers: options.headers ? toIncomingHttpHeaders(options.headers) : undefined,
      },
    });

    if ("isBot" in result) {
      if (!result.isBot || result.isVerifiedBot || result.isHuman) {
        return false;
      }

      if (options.allowBrowserFallback !== false && looksLikeBrowser(options.headers)) {
        // Prefer usability over false positives for same-origin browsers.
        return false;
      }

      return true;
    }
    return false;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[botCheck] checkBotId failed", err);
    }
    return false;
  }
}
