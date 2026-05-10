import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { withRouteTimeout } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

export const runtime = "nodejs";

// AI Career Tip — short, specific guidance for the artist viewing
// their own studio. The prompt is fed concrete stats from the artist's
// catalog (per-genre averages, conversion rates, recent battles) so
// the tip names actual songs/genres rather than handing back generic
// "post more" advice. Cached per-artist per-day to keep cost
// negligible — at ~$0.0003 per call, daily refresh for thousands of
// artists is a few cents a month.
//
// Honest scope: the cache is process-local (`tipCache` Map). Across
// Vercel function instances this is per-instance, not global, so a
// busy artist could hit two instances in one day and get two
// generations. Acceptable for now; a Redis cache is the proper fix
// when usage warrants it.

interface CachedTip {
  tip: string;
  generatedAt: number;
}

const tipCache = new Map<string, CachedTip>();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function cacheKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${userId}:${day}`;
}

export async function GET(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Cheap rate limit so an over-eager client polling for tips can't
  // hammer the LLM endpoint. 10 req/min/user keeps the door open for
  // honest retries.
  try {
    await strictLimiter.consume(`ai:career-tip:${userId}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  // Cache hit fast path — no OpenAI call.
  const key = cacheKey(userId);
  const cached = tipCache.get(key);
  if (cached && Date.now() - cached.generatedAt < ONE_DAY_MS) {
    return jsonWithRequestId(requestId, {
      tip: cached.tip,
      cached: true,
      generatedAt: new Date(cached.generatedAt).toISOString(),
    });
  }

  const client = openai;
  if (!client) {
    return jsonWithRequestId(
      requestId,
      { error: "AI is offline." },
      { status: 503 },
    );
  }

  // Pull just enough data to ground the tip. Songs include genre +
  // aiScore + streamCount + soldLicenses + versusWins/Losses; that's
  // everything we need to compute per-genre averages and conversion
  // rates without a heavy aggregate query.
  const songs = await prisma.song
    .findMany({
      where: { artistId: userId, isActive: true, isLegacy: false },
      select: {
        title: true,
        genre: true,
        aiScore: true,
        streamCount: true,
        soldLicenses: true,
        totalLicenses: true,
        versusWins: true,
        versusLosses: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    .catch(() => []);

  if (songs.length === 0) {
    const tip =
      "Upload your first track to unlock career-tip insights. " +
      "Tip from the platform: producers who publish 3 tracks in their first month see the highest fan retention.";
    tipCache.set(key, { tip, generatedAt: Date.now() });
    return jsonWithRequestId(requestId, { tip, cached: false });
  }

  // Per-genre roll-ups, then sort by score desc.
  const genreStats = new Map<
    string,
    { count: number; scoreSum: number; streams: number; sold: number; total: number; wins: number; losses: number }
  >();
  for (const song of songs) {
    const genre = (song.genre ?? "unknown").trim() || "unknown";
    const cur = genreStats.get(genre) ?? {
      count: 0,
      scoreSum: 0,
      streams: 0,
      sold: 0,
      total: 0,
      wins: 0,
      losses: 0,
    };
    cur.count++;
    cur.scoreSum += song.aiScore;
    cur.streams += song.streamCount;
    cur.sold += song.soldLicenses;
    cur.total += song.totalLicenses;
    cur.wins += song.versusWins;
    cur.losses += song.versusLosses;
    genreStats.set(genre, cur);
  }
  const genreRows = Array.from(genreStats.entries())
    .map(([genre, s]) => ({
      genre,
      avgScore: s.count > 0 ? s.scoreSum / s.count : 0,
      trackCount: s.count,
      streamCount: s.streams,
      soldLicenses: s.sold,
      conversionPct:
        s.streams > 0 ? (s.sold / s.streams) * 100 : 0,
      battleRecord: `${s.wins}W-${s.losses}L`,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // The highest-converting and highest-scoring tracks are the most
  // useful concrete references for the model.
  const topTracks = [...songs]
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, 5)
    .map((s) => ({
      title: s.title,
      genre: s.genre,
      aiScore: Number(s.aiScore.toFixed(1)),
      streams: s.streamCount,
      sold: s.soldLicenses,
    }));

  const promptStats = JSON.stringify(
    { genres: genreRows.slice(0, 8), topTracks },
    null,
    0,
  );

  const result = await withRouteTimeout("ai-career-tip", 15_000, async (signal) => {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are the Epic Music Space career coach. Given an artist's catalog stats, give one specific, actionable tip in 1–3 sentences. Reference real song titles or genres from the data. Don't hedge, don't add disclaimers, don't moralize. Examples: 'Your trap tracks average 31% higher EMS score than your R&B — start a battle with \"Night Drive\" next.' 'You have 0 battles but a 7-month catalog. One battle this week will materially move your discovery rank.'",
          },
          {
            role: "user",
            content: `Catalog stats (JSON): ${promptStats}\n\nReturn the tip text only — no preamble.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      },
      { signal },
    );
    return (
      completion.choices[0]?.message?.content?.trim() ??
      "Keep uploading — one more track this week will move your numbers."
    );
  });
  if (!result.ok) {
    return withRequestId(result.response, requestId);
  }

  const tip = result.value;
  tipCache.set(key, { tip, generatedAt: Date.now() });

  // Lightweight cache hygiene: stop the Map from growing forever by
  // dropping entries older than 2 days each call. Bounded by the number
  // of distinct artists; with cheap deletes it stays in microseconds.
  const cutoff = Date.now() - 2 * ONE_DAY_MS;
  for (const [k, v] of tipCache.entries()) {
    if (v.generatedAt < cutoff) tipCache.delete(k);
  }

  return jsonWithRequestId(requestId, { tip, cached: false });
}
