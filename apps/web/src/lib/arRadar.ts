import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface RadarArtist {
  artistId: string;
  artistName: string;
  username: string | null;
  image: string | null;
  trackCount: number;
  recentPlays: number;
  recentSaves: number;
  recentShares: number;
  recentLicenses: number;
  battleWins: number;
  avgAiScore: number;
  totalStreams: number;
  radarScore: number;
  signal: "heating" | "breakout" | "undervalued";
  why: string[];
  topTrack: {
    id: string;
    title: string;
    genre: string | null;
    coverUrl: string | null;
    licensePrice: number;
  } | null;
}

type RadarArtistDraft = Omit<RadarArtist, "signal" | "why">;

function classifySignal(artist: RadarArtistDraft): RadarArtist["signal"] {
  if (artist.recentLicenses > 0 || artist.recentShares >= 3) return "breakout";
  if (artist.avgAiScore >= 78 && artist.totalStreams < 500) return "undervalued";
  return "heating";
}

function explainRadar(artist: RadarArtistDraft): string[] {
  const reasons: string[] = [];
  if (artist.recentLicenses > 0) reasons.push(`${artist.recentLicenses} recent license${artist.recentLicenses === 1 ? "" : "s"}`);
  if (artist.recentShares > 0) reasons.push(`${artist.recentShares} share signal${artist.recentShares === 1 ? "" : "s"}`);
  if (artist.recentSaves > 0) reasons.push(`${artist.recentSaves} save signal${artist.recentSaves === 1 ? "" : "s"}`);
  if (artist.battleWins > 0) reasons.push(`${artist.battleWins} battle win${artist.battleWins === 1 ? "" : "s"}`);
  if (artist.avgAiScore >= 75) reasons.push(`AI quality ${Math.round(artist.avgAiScore)}`);
  if (artist.totalStreams < 500) reasons.push("low-exposure upside");
  if (artist.recentPlays > 0) reasons.push(`${artist.recentPlays} recent play${artist.recentPlays === 1 ? "" : "s"}`);
  return reasons.slice(0, 4);
}

export const getArRadar = unstable_cache(
  async (): Promise<RadarArtist[]> => {
    const since = new Date(Date.now() - WINDOW_MS);

    const songs = await prisma.song.findMany({
      where: { isActive: true, isLegacy: false },
      orderBy: [{ createdAt: "desc" }],
      take: 250,
      select: {
        id: true,
        title: true,
        genre: true,
        coverUrl: true,
        licensePrice: true,
        aiScore: true,
        streamCount: true,
        versusWins: true,
        soldLicenses: true,
        artistId: true,
        artist_: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
          },
        },
      },
    });

    if (songs.length === 0) return [];

    const songIds = songs.map((song) => song.id);
    const [events, licenses] = await Promise.all([
      prisma.userBehaviorEvent
        .groupBy({
          by: ["songId", "eventType"],
          where: { songId: { in: songIds }, createdAt: { gte: since } },
          _count: { _all: true },
        })
        .catch(() => [] as Array<{ songId: string | null; eventType: string; _count: { _all: number } }>),
      prisma.licenseToken
        .groupBy({
          by: ["songId"],
          where: { songId: { in: songIds }, purchasedAt: { gte: since } },
          _count: { _all: true },
        })
        .catch(() => [] as Array<{ songId: string; _count: { _all: number } }>),
    ]);

    const eventCounts = new Map<string, { plays: number; saves: number; shares: number }>();
    for (const event of events) {
      if (!event.songId) continue;
      const current = eventCounts.get(event.songId) ?? { plays: 0, saves: 0, shares: 0 };
      if (event.eventType === "view" || event.eventType === "view_track") current.plays += event._count._all;
      if (event.eventType === "like") current.saves += event._count._all;
      if (event.eventType === "share") current.shares += event._count._all;
      eventCounts.set(event.songId, current);
    }

    const licenseCounts = new Map<string, number>();
    for (const license of licenses) licenseCounts.set(license.songId, license._count._all);

    const byArtist = new Map<string, RadarArtistDraft & { aiTotal: number }>();
    for (const song of songs) {
      const artistName = song.artist_.name ?? song.artist_.username ?? "Unknown artist";
      const eventsForSong = eventCounts.get(song.id) ?? { plays: 0, saves: 0, shares: 0 };
      const recentLicenses = licenseCounts.get(song.id) ?? 0;
      const existing =
        byArtist.get(song.artistId) ??
        ({
          artistId: song.artistId,
          artistName,
          username: song.artist_.username,
          image: song.artist_.image,
          trackCount: 0,
          recentPlays: 0,
          recentSaves: 0,
          recentShares: 0,
          recentLicenses: 0,
          battleWins: 0,
          avgAiScore: 0,
          totalStreams: 0,
          radarScore: 0,
          topTrack: null,
          aiTotal: 0,
        } satisfies RadarArtistDraft & { aiTotal: number });

      existing.trackCount += 1;
      existing.recentPlays += eventsForSong.plays;
      existing.recentSaves += eventsForSong.saves;
      existing.recentShares += eventsForSong.shares;
      existing.recentLicenses += recentLicenses;
      existing.battleWins += song.versusWins;
      existing.totalStreams += song.streamCount;
      existing.aiTotal += song.aiScore;

      const currentTopScore = existing.topTrack
        ? songs.find((candidate) => candidate.id === existing.topTrack?.id)?.aiScore ?? 0
        : -1;
      if (!existing.topTrack || song.aiScore > currentTopScore) {
        existing.topTrack = {
          id: song.id,
          title: song.title,
          genre: song.genre,
          coverUrl: song.coverUrl,
          licensePrice: Number(song.licensePrice),
        };
      }
      byArtist.set(song.artistId, existing);
    }

    return [...byArtist.values()]
      .map(({ aiTotal, ...artist }) => {
        const avgAiScore = artist.trackCount > 0 ? aiTotal / artist.trackCount : 0;
        const scarcityBoost = artist.totalStreams < 500 ? 18 : artist.totalStreams < 2_500 ? 8 : 0;
        const radarScore =
          avgAiScore * 0.42 +
          artist.recentPlays * 0.8 +
          artist.recentSaves * 4 +
          artist.recentShares * 7 +
          artist.recentLicenses * 18 +
          artist.battleWins * 3 +
          scarcityBoost;
        const ranked = {
          ...artist,
          avgAiScore,
          radarScore,
        };
        return {
          ...ranked,
          signal: classifySignal(ranked),
          why: explainRadar(ranked),
        };
      })
      .sort((a, b) => b.radarScore - a.radarScore)
      .slice(0, 25);
  },
  ["ems:ar-radar:v1"],
  { revalidate: 300 },
);
