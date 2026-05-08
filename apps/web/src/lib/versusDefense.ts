import { getRedis } from "@/lib/redis";

type Counter = {
  streak: number;
  total: number;
};

type SongCounter = Counter & {
  artistId: string;
};

function toGenreKey(input: string | null | undefined) {
  const raw = (input ?? "open").trim().toLowerCase();
  return raw.length > 0 ? raw : "open";
}

function beltKey(genre: string) {
  return `ems:versus:belt:${toGenreKey(genre)}`;
}

function songCounterKey(songId: string) {
  return `ems:versus:defense:song:${songId}`;
}

function artistCounterKey(artistId: string) {
  return `ems:versus:defense:artist:${artistId}`;
}

async function readCounter(key: string): Promise<Counter> {
  const redis = getRedis();
  if (!redis) return { streak: 0, total: 0 };
  const raw = await redis.hgetall(key);
  return {
    streak: Number(raw.streak ?? 0),
    total: Number(raw.total ?? 0),
  };
}

export async function recordVersusDefenseOutcome(input: {
  genre: string | null | undefined;
  winnerSongId: string;
  winnerArtistId: string;
  loserSongId: string;
  loserArtistId: string;
}) {
  const redis = getRedis();
  if (!redis) {
    return {
      defended: false,
      song: { streak: 0, total: 0 },
      artist: { streak: 0, total: 0 },
    };
  }

  const genreKey = toGenreKey(input.genre);
  const currentHolderSongId = await redis.get(beltKey(genreKey));
  const defended = currentHolderSongId === input.winnerSongId;

  if (defended) {
    const [songTotal, songStreak, artistTotal, artistStreak] = await Promise.all([
      redis.hincrby(songCounterKey(input.winnerSongId), "total", 1),
      redis.hincrby(songCounterKey(input.winnerSongId), "streak", 1),
      redis.hincrby(artistCounterKey(input.winnerArtistId), "total", 1),
      redis.hincrby(artistCounterKey(input.winnerArtistId), "streak", 1),
    ]);

    await Promise.all([
      redis.hset(songCounterKey(input.winnerSongId), "artistId", input.winnerArtistId),
      redis.set(beltKey(genreKey), input.winnerSongId),
    ]);

    return {
      defended: true,
      song: { streak: songStreak, total: songTotal },
      artist: { streak: artistStreak, total: artistTotal },
    };
  }

  await Promise.all([
    redis.set(beltKey(genreKey), input.winnerSongId),
    redis.hset(songCounterKey(input.winnerSongId), "artistId", input.winnerArtistId),
    redis.hset(songCounterKey(input.winnerSongId), "streak", 0),
    redis.hset(artistCounterKey(input.winnerArtistId), "streak", 0),
    redis.hset(songCounterKey(input.loserSongId), "streak", 0),
    redis.hset(artistCounterKey(input.loserArtistId), "streak", 0),
  ]);

  const [winnerSong, winnerArtist] = await Promise.all([
    readCounter(songCounterKey(input.winnerSongId)),
    readCounter(artistCounterKey(input.winnerArtistId)),
  ]);

  return {
    defended: false,
    song: winnerSong,
    artist: winnerArtist,
  };
}

export async function getSongDefenseCounters(songIds: string[]) {
  const redis = getRedis();
  if (!redis || songIds.length === 0) return {} as Record<string, SongCounter>;

  const unique = Array.from(new Set(songIds));
  const rows = await Promise.all(
    unique.map(async (songId) => {
      const raw = await redis.hgetall(songCounterKey(songId));
      return [
        songId,
        {
          streak: Number(raw.streak ?? 0),
          total: Number(raw.total ?? 0),
          artistId: typeof raw.artistId === "string" ? raw.artistId : "",
        },
      ] as const;
    }),
  );

  return Object.fromEntries(rows);
}

export async function getArtistDefenseCounters(artistIds: string[]) {
  const redis = getRedis();
  if (!redis || artistIds.length === 0) return {} as Record<string, Counter>;

  const unique = Array.from(new Set(artistIds));
  const rows = await Promise.all(
    unique.map(async (artistId) => {
      const raw = await redis.hgetall(artistCounterKey(artistId));
      return [
        artistId,
        {
          streak: Number(raw.streak ?? 0),
          total: Number(raw.total ?? 0),
        },
      ] as const;
    }),
  );

  return Object.fromEntries(rows);
}
