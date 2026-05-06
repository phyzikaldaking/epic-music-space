import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Battle history",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

export default async function VersusHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/versus/history");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const skip = (page - 1) * PAGE_SIZE;

  // Battles where I voted OR where I'm one of the participating artists.
  const [voted, mine] = await Promise.all([
    prisma.versusVote.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
      include: {
        match: {
          include: {
            songA: { select: { id: true, title: true, artist: true, coverUrl: true, artistId: true } },
            songB: { select: { id: true, title: true, artist: true, coverUrl: true, artistId: true } },
          },
        },
      },
    }),
    prisma.versusMatch.findMany({
      where: {
        OR: [
          { songA: { artistId: session.user.id } },
          { songB: { artistId: session.user.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: {
        songA: { select: { id: true, title: true, artist: true, coverUrl: true, artistId: true } },
        songB: { select: { id: true, title: true, artist: true, coverUrl: true, artistId: true } },
      },
    }),
  ]);

  // W/L record for the user
  const myWins = mine.filter((m) => {
    const isCompleted = m.status === "COMPLETED" || m.endsAt < new Date();
    if (!isCompleted) return false;
    const winnerArtistId = m.votesA >= m.votesB ? m.songA.artistId : m.songB.artistId;
    return winnerArtistId === session.user.id;
  }).length;
  const myLosses = mine.filter((m) => {
    const isCompleted = m.status === "COMPLETED" || m.endsAt < new Date();
    if (!isCompleted) return false;
    const winnerArtistId = m.votesA >= m.votesB ? m.songA.artistId : m.songB.artistId;
    return winnerArtistId !== session.user.id;
  }).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-extrabold">Battle history</h1>
      {mine.length > 0 && (
        <p className="mb-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-sm">
          <span className="font-bold">Your record:</span>
          <span className="text-emerald-300">{myWins}W</span>
          <span className="text-white/30">–</span>
          <span className="text-red-300">{myLosses}L</span>
        </p>
      )}

      {mine.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/55">
            My battles
          </h2>
          <ul className="space-y-3">
            {mine.map((m) => (
              <BattleRow key={m.id} match={m} viewerId={session.user.id} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-white/55">
          Battles I voted in
        </h2>
        {voted.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 p-8 text-center text-sm text-white/45">
            You haven&apos;t voted in any battles yet. Find one at{" "}
            <Link href="/versus" className="text-brand-300 hover:underline">/versus</Link>.
          </div>
        ) : (
          <ul className="space-y-3">
            {voted.map((v) => (
              <BattleRow
                key={v.id}
                match={v.match}
                viewerId={null}
                votedSongId={v.votedSongId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface MatchLike {
  id: string;
  votesA: number;
  votesB: number;
  status: string;
  endsAt: Date;
  songA: { id: string; title: string; artist: string; coverUrl: string | null; artistId: string };
  songB: { id: string; title: string; artist: string; coverUrl: string | null; artistId: string };
}

function BattleRow({
  match,
  viewerId,
  votedSongId,
}: {
  match: MatchLike;
  viewerId: string | null;
  votedSongId?: string;
}) {
  const isCompleted = match.status === "COMPLETED" || match.endsAt < new Date();
  const winnerSong = isCompleted
    ? match.votesA >= match.votesB ? match.songA : match.songB
    : null;
  const myWin = viewerId && winnerSong
    ? winnerSong.artistId === viewerId
    : null;

  return (
    <li>
      <Link
        href={`/versus/${match.id}`}
        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 p-3 hover:bg-white/6"
      >
        <SongBadge song={match.songA} highlight={winnerSong?.id === match.songA.id} />
        <span className="text-xs font-bold text-white/30">vs</span>
        <SongBadge song={match.songB} highlight={winnerSong?.id === match.songB.id} />

        <div className="ml-auto text-right text-xs">
          {isCompleted ? (
            <p className="font-bold tabular-nums text-white/65">
              {match.votesA}–{match.votesB}
            </p>
          ) : (
            <p className="font-bold text-accent-300">LIVE</p>
          )}
          {myWin === true && <p className="text-[10px] text-emerald-300">you won</p>}
          {myWin === false && <p className="text-[10px] text-red-300">you lost</p>}
          {votedSongId === match.songA.id && (
            <p className="text-[10px] text-white/40">voted A</p>
          )}
          {votedSongId === match.songB.id && (
            <p className="text-[10px] text-white/40">voted B</p>
          )}
        </div>
      </Link>
    </li>
  );
}

function SongBadge({
  song,
  highlight,
}: {
  song: { id: string; title: string; coverUrl: string | null };
  highlight: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border p-2 ${
        highlight ? "border-gold-500/35 bg-gold-500/8" : "border-white/8 bg-white/3"
      }`}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-brand-900">
        {song.coverUrl ? (
          <Image src={song.coverUrl} alt="" fill unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base">🎵</div>
        )}
      </div>
      <p className="truncate text-xs font-bold">{song.title}</p>
    </div>
  );
}
