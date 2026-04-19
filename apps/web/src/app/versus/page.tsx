import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import VersusCard from "@/components/VersusCard";

export const dynamic = "force-dynamic";

export default async function VersusPage() {
  const session = await auth();

  const matches = await prisma.versusMatch.findMany({
    where: { status: "ACTIVE" },
    include: {
      songA: {
        select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true },
      },
      songB: {
        select: { id: true, title: true, artist: true, coverUrl: true, aiScore: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Get current user's votes
  let userVotes: Record<string, string> = {};
  if (session?.user?.id) {
    const votes = await prisma.versusVote.findMany({
      where: { userId: session.user.id, matchId: { in: matches.map((m) => m.id) } },
    });
    userVotes = Object.fromEntries(votes.map((v) => [v.matchId, v.votedSongId]));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">⚔️ Versus</h1>
        <p className="mt-2 text-white/50">
          Vote for your favourite tracks. Winners rise in the discovery algorithm.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="py-24 text-center text-white/30">
          <p className="text-xl font-semibold">No active battles right now.</p>
          <p className="mt-2 text-sm">Check back soon!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {matches.map((m) => (
            <VersusCard
              key={m.id}
              matchId={m.id}
              songA={m.songA}
              songB={m.songB}
              votesA={m.votesA}
              votesB={m.votesB}
              endsAt={m.endsAt.toISOString()}
              userVotedSongId={userVotes[m.id] ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
