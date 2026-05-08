import { getRedis } from "@/lib/redis";
import { awardFanWeeklyPoints } from "@/lib/weeklyseason";

// ─────────────────────────────────────────────────────────────────────────────
// Fan Pick'em — Redis hash per match
// Key: ems:picks:{matchId}   field = userId   value = "A" | "B"
// ─────────────────────────────────────────────────────────────────────────────

const PICK_TTL_SECONDS = 8 * 24 * 3600; // 8 days — survives match + resolution window
const CORRECT_PICK_POINTS = 10;

function pickHashKey(matchId: string): string {
  return `ems:picks:${matchId}`;
}

/**
 * Save a fan's pre-match prediction.
 * Uses HSETNX so duplicate submissions are rejected without overwriting.
 * Returns `true` if the pick was saved, `false` if one already existed.
 */
export async function saveFanPick(
  matchId: string,
  userId: string,
  side: "A" | "B",
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const key = pickHashKey(matchId);
  try {
    const set = await redis.hsetnx(key, userId, side);
    if (set === 1) {
      await redis.expire(key, PICK_TTL_SECONDS);
    }
    return set === 1;
  } catch {
    return false;
  }
}

/**
 * Returns the fan's saved pick for this match, or `null` if none was stored.
 */
export async function getFanPick(
  matchId: string,
  userId: string,
): Promise<"A" | "B" | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const val = await redis.hget(pickHashKey(matchId), userId);
    if (val === "A" || val === "B") return val;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve all picks for a completed match.
 *
 * Iterates every stored pick, compares to `winningSide`, and awards
 * `CORRECT_PICK_POINTS` weekly fan points to each correct caller.
 * The hash is deleted after resolution to free memory.
 */
export async function resolvePicksForMatch(
  matchId: string,
  winningSide: "A" | "B",
): Promise<{ correct: number; total: number }> {
  const redis = getRedis();
  if (!redis) return { correct: 0, total: 0 };
  const key = pickHashKey(matchId);
  try {
    const all = await redis.hgetall(key);
    const entries = Object.entries(all);
    if (entries.length === 0) return { correct: 0, total: 0 };

    let correct = 0;
    await Promise.allSettled(
      entries.map(async ([userId, pick]) => {
        if (pick === winningSide) {
          correct++;
          await awardFanWeeklyPoints(userId, CORRECT_PICK_POINTS);
        }
      }),
    );

    await redis.del(key);
    return { correct, total: entries.length };
  } catch {
    return { correct: 0, total: 0 };
  }
}

/**
 * Count how many pick entries exist for a match.
 * Useful for showing "X fans have locked in a pick" on the match page.
 */
export async function getPickCount(matchId: string): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    return await redis.hlen(pickHashKey(matchId));
  } catch {
    return 0;
  }
}
