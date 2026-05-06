import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface Props {
  /**
   * Currently-playing song (if any). When set, the strip prioritizes
   * battles featuring this exact track first, then falls back to other
   * battles by the same artist, then by genre, then any active battle.
   */
  currentSongId?: string | null;
  currentSongArtist?: string | null;
  currentSongGenre?: string | null;
  /**
   * Room id — passed back to the battle page as a `from=` so we can later
   * deep-link the listener back into the room they came from.
   */
  roomId: string;
}

const SONG_SELECT = {
  id: true,
  title: true,
  artist: true,
  genre: true,
  coverUrl: true,
} as const;

async function findRelevantBattles(
  currentSongId: string | null | undefined,
  currentSongArtist: string | null | undefined,
  currentSongGenre: string | null | undefined,
) {
  const baseWhere = { status: "ACTIVE" as const, endsAt: { gt: new Date() } };

  // 1. Direct match — battles where the currently-playing song is one side.
  if (currentSongId) {
    const direct = await prisma.versusMatch.findMany({
      where: {
        ...baseWhere,
        OR: [{ songAId: currentSongId }, { songBId: currentSongId }],
      },
      include: { songA: { select: SONG_SELECT }, songB: { select: SONG_SELECT } },
      orderBy: { endsAt: "asc" },
      take: 4,
    });
    if (direct.length > 0) return { battles: direct, source: "this-track" as const };
  }

  // 2. Same-artist battles. The Song.artist column is the public artist name
  // (free-text), so a string match is the best we can do without an
  // artistId index across both songs.
  if (currentSongArtist) {
    const sameArtist = await prisma.versusMatch.findMany({
      where: {
        ...baseWhere,
        OR: [
          { songA: { artist: currentSongArtist } },
          { songB: { artist: currentSongArtist } },
        ],
      },
      include: { songA: { select: SONG_SELECT }, songB: { select: SONG_SELECT } },
      orderBy: { endsAt: "asc" },
      take: 4,
    });
    if (sameArtist.length > 0) return { battles: sameArtist, source: "this-artist" as const };
  }

  // 3. Same-genre battles.
  if (currentSongGenre) {
    const sameGenre = await prisma.versusMatch.findMany({
      where: {
        ...baseWhere,
        OR: [
          { songA: { genre: currentSongGenre } },
          { songB: { genre: currentSongGenre } },
        ],
      },
      include: { songA: { select: SONG_SELECT }, songB: { select: SONG_SELECT } },
      orderBy: { endsAt: "asc" },
      take: 4,
    });
    if (sameGenre.length > 0) return { battles: sameGenre, source: "same-genre" as const };
  }

  // 4. Anything live right now.
  const fallback = await prisma.versusMatch.findMany({
    where: baseWhere,
    include: { songA: { select: SONG_SELECT }, songB: { select: SONG_SELECT } },
    orderBy: { endsAt: "asc" },
    take: 4,
  });
  return { battles: fallback, source: "any" as const };
}

function timeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "closing";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  return `${hours}h left`;
}

function eyebrowFor(source: "this-track" | "this-artist" | "same-genre" | "any"): string {
  switch (source) {
    case "this-track":
      return "This track is in the ring";
    case "this-artist":
      return "This artist has a live battle";
    case "same-genre":
      return "Battles in this genre";
    default:
      return "Live battles right now";
  }
}

export default async function RoomBattleStrip({
  currentSongId,
  currentSongArtist,
  currentSongGenre,
  roomId,
}: Props) {
  let result: Awaited<ReturnType<typeof findRelevantBattles>>;
  try {
    result = await findRelevantBattles(currentSongId, currentSongArtist, currentSongGenre);
  } catch {
    return null;
  }
  if (result.battles.length === 0) return null;

  const eyebrow = eyebrowFor(result.source);

  return (
    <section
      className="mx-auto mb-3 w-full max-w-[1400px] px-4 sm:px-6"
      aria-label="Active Versus battles related to this room"
    >
      <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),rgba(0,0,0,0.5)_55%,rgba(253,224,71,0.08))] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-100">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
              Live
            </span>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/85">
              {eyebrow}
            </p>
          </div>
          <Link
            href="/versus"
            className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55 hover:text-cyan-200"
          >
            All battles →
          </Link>
        </div>

        <ul className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          {result.battles.map((m) => {
            const total = Math.max(1, m.votesA + m.votesB);
            const aPct = Math.round((m.votesA / total) * 100);
            return (
              <li key={m.id}>
                <Link
                  href={`/versus/${m.id}?from=room:${roomId}`}
                  className="block rounded-xl border border-white/10 bg-black/40 p-3 transition hover:-translate-y-0.5 hover:border-cyan-200/45"
                  aria-label={`Vote in: ${m.songA.title} versus ${m.songB.title} — ${timeLeft(m.endsAt)}`}
                >
                  <p className="line-clamp-1 text-sm font-black text-white">
                    {m.songA.title}
                    <span className="mx-1.5 text-white/35">vs</span>
                    {m.songB.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-white/45">
                    {m.songA.artist} · {m.songB.artist}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-300 via-white/80 to-gold-300"
                      style={{ width: `${Math.max(2, Math.min(98, aPct))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">
                    <span>{(m.votesA + m.votesB).toLocaleString()} votes</span>
                    <span>{timeLeft(m.endsAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
