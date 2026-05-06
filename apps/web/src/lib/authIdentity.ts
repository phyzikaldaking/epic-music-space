import { createHash } from "node:crypto";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve the client's real IP from request headers.
 *
 * Header precedence (most-trusted first):
 *   1. `x-vercel-forwarded-for` — set by Vercel's edge after stripping any
 *      client-supplied X-Forwarded-For. Trustworthy on Vercel.
 *   2. `cf-connecting-ip` — Cloudflare's equivalent if traffic ever proxies
 *      through CF before Vercel.
 *   3. `x-real-ip` — set by some upstream proxies.
 *   4. `x-forwarded-for` first hop — only as a last resort, since this
 *      header is user-controlled and an attacker can spoof it to either
 *      bypass per-IP throttles or deliberately lock a victim out.
 *
 * The previous implementation read `x-forwarded-for` first, which let a
 * direct request with `X-Forwarded-For: 1.2.3.4` poison every signInGuard
 * bucket keyed on IP.
 */
export function getClientIp(headers: Pick<Headers, "get"> | null | undefined): string {
  const vercel = headers?.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;

  const cf = headers?.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;

  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  return "unknown";
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
