import { createHash } from "node:crypto";

const SALT_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hash an IP with a daily-rotating salt. Privacy-preserving: lets us dedupe
 * impressions per-IP within a 24h window without storing raw IPs.
 */
export function hashIp(ip: string): string {
  const salt = process.env.AD_TRACKING_SALT ?? "ems-default-salt";
  const day = Math.floor(Date.now() / SALT_DAY_MS);
  return createHash("sha256").update(`${salt}:${day}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
