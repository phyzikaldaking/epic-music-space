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
      <div className="mb-10 flex items-start justify-between">
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

      {isEmpty ? (
        <div className="py-24 text-center text-white/30">
          <p className="text-xl font-semibold">No active battles right now.</p>
          <p className="mt-2 text-sm">
            {isArtist
              ? "Start the first battle using the button above!"
              : "Check back soon!"}
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
