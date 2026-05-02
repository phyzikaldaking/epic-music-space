import { createHash } from "crypto";
import { NextRequest } from "next/server";

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function buildIdempotencyKey(
  req: NextRequest,
  prefix: string,
  stableParts: Array<string | number | undefined | null>,
) {
  const rawHeader = req.headers.get("idempotency-key")?.trim();
  if (rawHeader) return `${prefix}:${sha256(rawHeader)}`;

  // Fallback key keeps retries in a short window idempotent even if client
  // does not provide a dedicated header.
  const windowBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const fingerprint = stableParts.map((value) => String(value ?? "")).join("|");
  return `${prefix}:${sha256(`${fingerprint}|${windowBucket}`)}`;
}
