type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as { emsCollabRateLimit?: Map<string, Bucket> };
const buckets = globalForRateLimit.emsCollabRateLimit ?? new Map<string, Bucket>();
if (!globalForRateLimit.emsCollabRateLimit) globalForRateLimit.emsCollabRateLimit = buckets;

function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const user = request.headers.get("x-ems-user-email") ?? request.headers.get("x-user-email");
  return user ?? forwarded ?? realIp ?? "anonymous";
}

export function checkCollabRateLimit(request: Request, scope: string, limit = 30, windowMs = 60_000) {
  const key = `${scope}:${getClientKey(request)}`;
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

export function collabRateLimitHeaders(result: { remaining: number; resetAt: number }) {
  return {
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
