import { NextResponse } from "next/server";
import { moderateLimiter, strictLimiter, lenientLimiter } from "@/lib/rateLimit";

type Tier = "strict" | "moderate" | "lenient";

const limiters = {
  strict: strictLimiter,
  moderate: moderateLimiter,
  lenient: lenientLimiter,
};

/**
 * Inline rate-limit check for routes that don't fit the withRateLimit
 * wrapper signature (e.g. App Router params-style handlers). Returns null
 * when the request is allowed and a 429 NextResponse when blocked.
 *
 * Usage:
 *   const blocked = await rateLimit("moderate", `chat:${userId}:${roomId}`);
 *   if (blocked) return blocked;
 */
export async function rateLimit(tier: Tier, key: string): Promise<NextResponse | null> {
  try {
    await limiters[tier].consume(key);
    return null;
  } catch {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
}
