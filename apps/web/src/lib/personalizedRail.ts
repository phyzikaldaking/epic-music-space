/**
 * Personalized discovery scoring — server-side, deterministic, no ML.
 *
 * Given a candidate set of marketplace tracks plus a small "taste signal"
 * extracted from the viewer's recent license purchases (genre, BPM, key
 * frequency), produce an ordered top-N with a short human-readable reason
 * per pick. For cold users (no signal) fall back to a curated diverse mix
 * that prioritizes Versus winners and quality.
 */

export interface RailCandidate {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  coverUrl: string | null;
  bpm: number | null;
  key: string | null;
  aiScore: number;
  rankScore: number;
  versusWins: number;
  versusLosses: number;
  createdAt: Date | null;
  licensePrice: number;
  revenueSharePct: number;
  soldLicenses: number;
  totalLicenses: number;
}

export interface TasteSignal {
  /** Lower-cased genre → frequency. */
  genres: Map<string, number>;
  /** "C minor" → frequency, case-preserved. */
  keys: Map<string, number>;
  /** Centroid BPM averaged across recent purchases (rounded). 0 if unknown. */
  bpmCentroid: number;
  /** Song ids the viewer has already licensed — exclude from rail. */
  ownedSongIds: Set<string>;
}

export interface RailPick {
  song: RailCandidate;
  reason: string;
  matchScore: number;
}

const RECENCY_BONUS_MAX = 8;
const QUALITY_WEIGHT = 0.35;
const GENRE_BONUS = 32;
const KEY_BONUS = 10;
const BPM_BONUS_NEAR = 10;
const BPM_NEAR_WINDOW = 10;
const VERSUS_WIN_BONUS = 6;

export function buildTasteSignal(recentLicenses: {
  songId: string;
  song: { genre: string | null; key: string | null; bpm: number | null };
}[]): TasteSignal {
  const genres = new Map<string, number>();
  const keys = new Map<string, number>();
  const ownedSongIds = new Set<string>();
  let bpmSum = 0;
  let bpmCount = 0;

  for (const lic of recentLicenses) {
    ownedSongIds.add(lic.songId);
    const g = lic.song.genre?.trim().toLowerCase();
    if (g) genres.set(g, (genres.get(g) ?? 0) + 1);
    const k = lic.song.key?.trim();
    if (k) keys.set(k, (keys.get(k) ?? 0) + 1);
    if (typeof lic.song.bpm === "number" && lic.song.bpm > 0) {
      bpmSum += lic.song.bpm;
      bpmCount += 1;
    }
  }

  return {
    genres,
    keys,
    bpmCentroid: bpmCount > 0 ? Math.round(bpmSum / bpmCount) : 0,
    ownedSongIds,
  };
}

function recencyBonus(createdAt: Date | null): number {
  if (!createdAt) return 0;
  const days = Math.max(0, (Date.now() - createdAt.getTime()) / 86_400_000);
  if (days >= 60) return 0;
  return Math.round(((60 - days) / 60) * RECENCY_BONUS_MAX);
}

function reasonFor(
  song: RailCandidate,
  signal: TasteSignal,
  matchedGenre: boolean,
  matchedKey: boolean,
  matchedBpm: boolean,
): string {
  if (matchedGenre && song.genre) {
    return `Because you back ${capitalize(song.genre)}`;
  }
  if (matchedKey && song.key) {
    return `Same key as your library — ${song.key}`;
  }
  if (matchedBpm && song.bpm) {
    return `BPM near your taste (${song.bpm})`;
  }
  if (song.versusWins > song.versusLosses && song.versusWins > 0) {
    return "Recent Versus winner";
  }
  if (signal.genres.size === 0 && song.aiScore >= 85) {
    return "Top of the floor";
  }
  return "Studio pick for you";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Build the personalized "Made for you" rail.
 *
 * - When a taste signal exists, score every candidate and surface a top-N
 *   with reasons. Excludes tracks the viewer already owns.
 * - When the signal is empty (cold user), build a *diverse* discovery rail:
 *   one track per top genre, biased toward Versus winners + quality. We
 *   intentionally don't just sort by rankScore — that produces the same
 *   list everyone else sees, which is the opposite of "made for you."
 */
export function buildMadeForYouRail(
  candidates: RailCandidate[],
  signal: TasteSignal,
  limit = 6,
): RailPick[] {
  const eligible = candidates.filter((s) => !signal.ownedSongIds.has(s.id));
  const hasSignal = signal.genres.size > 0 || signal.keys.size > 0 || signal.bpmCentroid > 0;

  if (hasSignal) {
    const scored: RailPick[] = eligible.map((song) => {
      const songGenre = song.genre?.toLowerCase() ?? null;
      const matchedGenre = Boolean(songGenre && signal.genres.has(songGenre));
      const matchedKey = Boolean(song.key && signal.keys.has(song.key));
      const matchedBpm =
        signal.bpmCentroid > 0 &&
        typeof song.bpm === "number" &&
        Math.abs(song.bpm - signal.bpmCentroid) <= BPM_NEAR_WINDOW;

      let score = song.aiScore * QUALITY_WEIGHT + recencyBonus(song.createdAt);
      if (matchedGenre) score += GENRE_BONUS;
      if (matchedKey) score += KEY_BONUS;
      if (matchedBpm) score += BPM_BONUS_NEAR;
      if (song.versusWins > song.versusLosses) score += VERSUS_WIN_BONUS;

      return {
        song,
        reason: reasonFor(song, signal, matchedGenre, matchedKey, matchedBpm),
        matchScore: Math.round(score),
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);
    return scored.slice(0, limit);
  }

  // Cold path: diverse picks. One per top genre, then top winners, then
  // quality fillers. Dedup by song id so a track can't appear twice.
  const used = new Set<string>();
  const picks: RailPick[] = [];

  // 1. One track per genre, picking the highest-quality representative.
  const byGenre = new Map<string, RailCandidate[]>();
  for (const song of eligible) {
    const g = song.genre?.trim().toLowerCase() || "other";
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g)!.push(song);
  }
  const genreOrder = Array.from(byGenre.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, Math.min(limit, byGenre.size));
  for (const [, songs] of genreOrder) {
    const best = songs.slice().sort((a, b) => b.aiScore - a.aiScore)[0];
    if (!best || used.has(best.id)) continue;
    used.add(best.id);
    picks.push({
      song: best,
      reason: best.versusWins > best.versusLosses && best.versusWins > 0
        ? "Recent Versus winner"
        : best.genre
          ? `Top in ${capitalize(best.genre)}`
          : "Studio pick",
      matchScore: best.aiScore,
    });
    if (picks.length >= limit) break;
  }

  // 2. If we still have room, fill with top quality across all eligible.
  if (picks.length < limit) {
    const remaining = eligible
      .filter((s) => !used.has(s.id))
      .sort((a, b) => b.rankScore - a.rankScore);
    for (const song of remaining) {
      if (picks.length >= limit) break;
      picks.push({
        song,
        reason: "Top of the floor",
        matchScore: Math.round(song.rankScore),
      });
    }
  }

  return picks;
}
