import type { RateLimiterRes } from "rate-limiter-flexible";
import { moderateLimiter, strictLimiter } from "@/lib/rateLimit";

function attemptIpKey(ip: string) {
  return `signin:attempt:ip:${ip}`;
}

function failedEmailKey(email: string) {
  return `signin:failed:email:${email}`;
}

function failedEmailIpKey(email: string, ip: string) {
  return `signin:failed:email-ip:${email}:${ip}`;
}

function failedIpKey(ip: string) {
  return `signin:failed:ip:${ip}`;
}

function retryAfterSecondsFrom(value: unknown, fallback = 60): number {
  if (!value || typeof value !== "object") return fallback;
  const msBeforeNext = Number((value as { msBeforeNext?: unknown }).msBeforeNext);
  if (!Number.isFinite(msBeforeNext) || msBeforeNext <= 0) return fallback;
  return Math.max(1, Math.ceil(msBeforeNext / 1000));
}

function isBlocked(res: RateLimiterRes | null): boolean {
  if (!res) return false;
  return res.remainingPoints <= 0 && res.msBeforeNext > 0;
}

async function safeGet(
  limiter: { get: (key: string) => Promise<RateLimiterRes | null> },
  key: string,
) {
  try {
    return await limiter.get(key);
  } catch {
    return null;
  }
}

export async function assertSignInAllowed(email: string, ip: string) {
  try {
    await moderateLimiter.consume(attemptIpKey(ip));
  } catch (err) {
    return {
      allowed: false as const,
      retryAfterSeconds: retryAfterSecondsFrom(err),
    };
  }

  const limiter = strictLimiter as typeof strictLimiter & {
    get: (key: string) => Promise<RateLimiterRes | null>;
  };

  const [emailState, emailIpState, ipState] = await Promise.all([
    safeGet(limiter, failedEmailKey(email)),
    safeGet(limiter, failedEmailIpKey(email, ip)),
    safeGet(limiter, failedIpKey(ip)),
  ]);

  if (isBlocked(emailState) || isBlocked(emailIpState) || isBlocked(ipState)) {
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(
        retryAfterSecondsFrom(emailState, 0),
        retryAfterSecondsFrom(emailIpState, 0),
        retryAfterSecondsFrom(ipState, 0),
        60,
      ),
    };
  }

  return { allowed: true as const };
}

export async function recordFailedSignIn(email: string, ip: string) {
  await Promise.allSettled([
    strictLimiter.consume(failedEmailKey(email)),
    strictLimiter.consume(failedEmailIpKey(email, ip)),
    strictLimiter.consume(failedIpKey(ip)),
  ]);
}

export async function clearSignInFailures(email: string, ip: string) {
  const limiter = strictLimiter as typeof strictLimiter & {
    delete?: (key: string) => Promise<void>;
  };
  if (typeof limiter.delete !== "function") return;

  await Promise.allSettled([
    limiter.delete(failedEmailKey(email)),
    limiter.delete(failedEmailIpKey(email, ip)),
    limiter.delete(failedIpKey(ip)),
  ]);
}
