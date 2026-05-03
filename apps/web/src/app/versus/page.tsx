import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import VersusCard from "@/components/VersusCard";
import BattleRoyaleCard from "@/components/BattleRoyaleCard";
import CreateBattleForm from "@/components/CreateBattleForm";

export const dynamic = "force-dynamic";

export default async function VersusPage() {
  const session = await auth();

  const isArtist =
    Boolean(session?.user?.id) && session!.user.role !== "LISTENER";

  const [matches, royales, artistSongs] = await Promise.all([
    prisma.versusMatch.findMany({
      where: { status: "ACTIVE" },
      include: {
        songA: {
          select: {
            id: true, title: true, artist: true,
            coverUrl: true, audioUrl: true, aiScore: true,
          },
        },
        songB: {
          select: {
            id: true, title: true, artist: true,
            coverUrl: true, audioUrl: true, aiScore: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.battleRoyale.findMany({
      where: { status: "ACTIVE" },
      include: {
        entries: {
          include: {
            song: {
              select: {
                id: true, title: true, artist: true,
                coverUrl: true, audioUrl: true, aiScore: true,
              },
            },
          },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    isArtist
      ? prisma.song.findMany({
          where: { artistId: session?.user?.id ?? "", isActive: true },
          select: { id: true, title: true, artist: true, coverUrl: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  // Get user votes for 1v1 and royale
  let userVotes: Record<string, string> = {};
  let userRoyaleVotes: Record<string, string> = {};
  if (session?.user?.id) {
    const [votes, royaleVotes] = await Promise.all([
      prisma.versusVote.findMany({
        where: {
          userId: session.user.id,
          matchId: { in: matches.map((m) => m.id) },
        },
      }),
      prisma.battleRoyaleVote.findMany({
        where: {
          userId: session.user.id,
          battleId: { in: royales.map((r) => r.id) },
        },
      }),
    ]);
    userVotes = Object.fromEntries(votes.map((v) => [v.matchId, v.votedSongId]));
    userRoyaleVotes = Object.fromEntries(royaleVotes.map((v) => [v.battleId, v.songId]));
  }

  // Merge and sort all battles by createdAt
  type BattleItem =
    | { type: "1v1"; createdAt: Date; data: (typeof matches)[0] }
    | { type: "royale"; createdAt: Date; data: (typeof royales)[0] };

  const all: BattleItem[] = [
    ...matches.map((m) => ({ type: "1v1" as const, createdAt: m.createdAt, data: m })),
    ...royales.map((r) => ({ type: "royale" as const, createdAt: r.createdAt, data: r })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const isEmpty = all.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* ── Header ──────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-4xl font-extrabold">
            <svg
              aria-hidden="true"
              className="h-9 w-9 text-accent-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.121 14.121 5.657-5.657M14.121 14.121 9.879 9.879M14.121 14.121l2.122 2.121M9.879 9.879 4.222 4.222M9.879 9.879l-2.121 2.121M6.343 17.657l1.415-1.415M17.657 6.343l-1.415 1.415"
              />
            </svg>
            Versus
          </h1>
          <p className="mt-2 text-white/50">
            Vote for your favorites. Winners rise in the discovery algorithm.
          </p>
        </div>
        {isArtist && <CreateBattleForm songs={artistSongs} />}
      </div>

      {/* ── Artist CTA banner (prominent, always visible) ── */}
      {isArtist && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-accent-500/25 bg-accent-500/8 px-5 py-4">
          <div>
            <p className="font-bold text-accent-300">⚔️ Ready to battle?</p>
            <p className="mt-0.5 text-sm text-white/45">
              {artistSongs.length >= 2
                ? "Pick 2–10 of your songs and let the community decide."
                : "Upload at least 2 songs, then start a 1v1 or Battle Royale."}
            </p>
          </div>
          <CreateBattleForm songs={artistSongs} />
        </div>
      )}

      {!session?.user?.id && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/4 px-5 py-4">
          <p className="text-sm text-white/50">Sign in to vote and create battles.</p>
          <a
            href="/auth/signin?callbackUrl=/versus"
            className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600 transition"
          >
            Sign in
          </a>
        </div>
      )}

      {isEmpty ? (
        <div className="py-20 text-center">
          <p className="text-5xl mb-4">⚔️</p>
          <p className="text-xl font-semibold text-white/60">No active battles right now.</p>
          <p className="mt-2 text-sm text-white/30">
            {isArtist ? "Be the first — start a battle above!" : "Check back soon — battles are coming."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {all.map((item) =>
            item.type === "1v1" ? (
              <VersusCard
                key={item.data.id}
                matchId={item.data.id}
                songA={item.data.songA}
                songB={item.data.songB}
                votesA={item.data.votesA}
                votesB={item.data.votesB}
                endsAt={item.data.endsAt.toISOString()}
                userVotedSongId={userVotes[item.data.id] ?? null}
              />
            ) : (
              <BattleRoyaleCard
                key={item.data.id}
                battleId={item.data.id}
                entries={item.data.entries}
                endsAt={item.data.endsAt.toISOString()}
                userVotedSongId={userRoyaleVotes[item.data.id] ?? null}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
