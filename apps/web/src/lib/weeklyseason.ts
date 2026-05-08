import { getRedis } from "@/lib/redis";

// ─────────────────────────────────────────────────────────────────────────────
// ISO-8601 week utilities
// ─────────────────────────────────────────────────────────────────────────────

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // 1 = Mon … 7 = Sun
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Returns the ISO week key — e.g. "2026-W19". */
export function getWeekKey(date?: Date): string {
  const d = date ?? new Date();
  const week = isoWeekNumber(d);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Human-readable season label — e.g. "Week 19 · Q2 2026".
 * Matches the language used across the battle arena UI.
 */
export function getWeekLabel(date?: Date): string {
  const d = date ?? new Date();
  const week = isoWeekNumber(d);
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Week ${week} · Q${quarter} ${d.getUTCFullYear()}`;
}

/**
 * Returns Monday 00:00:00 UTC (start) and Sunday 23:59:59.999 UTC (end)
 * for the ISO week containing `date`.
 */
export function getWeekBounds(date?: Date): { start: Date; end: Date } {
  const d = date ?? new Date();
  const dayOfWeek = d.getUTCDay() || 7; // 1 = Mon … 7 = Sun
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (dayOfWeek - 1)),
  );
  const sunday = new Date(monday.getTime() + 7 * 86_400_000 - 1);
  return { start: monday, end: sunday };
}

/** Milliseconds until the current ISO week ends (Sunday 23:59:59.999 UTC). */
export function getMsUntilWeekReset(date?: Date): number {
  const now = date ?? new Date();
  const { end } = getWeekBounds(now);
  return Math.max(0, end.getTime() - now.getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly points — Redis sorted sets
// Keys: ems:weekly:{weekKey}:artists  /  ems:weekly:{weekKey}:fans
// ─────────────────────────────────────────────────────────────────────────────

const WEEK_TTL_SECONDS = 15 * 24 * 3600; // keep 15 days

export async function awardArtistWeeklyPoints(
  artistId: string,
  points: number,
  weekKey?: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `ems:weekly:${weekKey ?? getWeekKey()}:artists`;
  try {
    await redis.zincrby(key, points, artistId);
    await redis.expire(key, WEEK_TTL_SECONDS);
  } catch {
    // Non-critical — degrade silently
  }
}

export async function awardFanWeeklyPoints(
  userId: string,
  points: number,
  weekKey?: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `ems:weekly:${weekKey ?? getWeekKey()}:fans`;
  try {
    await redis.zincrby(key, points, userId);
    await redis.expire(key, WEEK_TTL_SECONDS);
  } catch {
    // Non-critical — degrade silently
  }
}

export type WeeklyEntry = { id: string; points: number };

export async function getWeeklyArtistTopN(
  n: number,
  weekKey?: string,
): Promise<WeeklyEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const key = `ems:weekly:${weekKey ?? getWeekKey()}:artists`;
  try {
    const raw = await redis.zrevrange(key, 0, n - 1, "WITHSCORES");
    const result: WeeklyEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ id: raw[i]!, points: parseFloat(raw[i + 1] ?? "0") });
    }
    return result;
  } catch {
    return [];
  }
}

export async function getWeeklyFanTopN(
  n: number,
  weekKey?: string,
): Promise<WeeklyEntry[]> {
  const redis = getRedis();
  if (!redis) return [];
  const key = `ems:weekly:${weekKey ?? getWeekKey()}:fans`;
  try {
    const raw = await redis.zrevrange(key, 0, n - 1, "WITHSCORES");
    const result: WeeklyEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ id: raw[i]!, points: parseFloat(raw[i + 1] ?? "0") });
    }
    return result;
  } catch {
    return [];
  }
}

/** Get the weekly point total for a single user (artist or fan). */
export async function getUserWeeklyPoints(
  userId: string,
  kind: "artists" | "fans",
  weekKey?: string,
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const key = `ems:weekly:${weekKey ?? getWeekKey()}:${kind}`;
  try {
    const score = await redis.zscore(key, userId);
    return score ? parseFloat(score) : 0;
  } catch {
    return 0;
  }
}
