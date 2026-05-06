import { createHash } from "node:crypto";

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getClientIp(headers: Pick<Headers, "get"> | null | undefined): string {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;

  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;

  return "unknown";
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
