import { createHash } from "crypto";

/**
 * Deterministic messageId for EmailOutbox deduplication.
 * Same userId + type + calendar day → same ID → safe to call multiple times.
 */
export function outboxMessageId(
  userId: string,
  type: string,
  date: Date = new Date(),
): string {
  const day = date.toISOString().slice(0, 10);
  return createHash("sha256").update(`${userId}:${type}:${day}`).digest("hex");
}

