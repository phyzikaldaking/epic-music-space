import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import VersusCard from "@/components/VersusCard";
import CreateBattleForm from "@/components/CreateBattleForm";

export const dynamic = "force-dynamic";

export default async function VersusPage() {
  const session = await auth();

  const [matches, artistSongs] = await Promise.all([
    prisma.versusMatch.findMany({
      where: { status: "ACTIVE" },
      include: {
        songA: {
          select: { id: true, title: true, artist: true, coverUrl: true, audioUrl: true, aiScore: true },
        },
        songB: {
          select: { id: true, title: true, artist: true, coverUrl: true, audioUrl: true, aiScore: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    // Fetch artist's own songs for the Create Battle form
    session?.user?.id && (session.user as { role?: string }).role !== "LISTENER"
      ? prisma.song.findMany({
          where: { artistId: session.user.id, isActive: true },
          select: { id: true, title: true, artist: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  // Get current user's votes
  let userVotes: Record<string, string> = {};
  if (session?.user?.id) {
    const votes = await prisma.versusVote.findMany({
      where: { userId: session.user.id, matchId: { in: matches.map((m) => m.id) } },
    });
    userVotes = Object.fromEntries(votes.map((v) => [v.matchId, v.votedSongId]));
  }

  const isArtist = !!session?.user?.id && (session.user as { role?: string }).role !== "LISTENER";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-extrabold">⚔️ Versus</h1>
          <p className="mt-2 text-white/50">
            Vote for your favorite tracks. Winners rise in the discovery algorithm.
          </p>
        </div>
        {isArtist && (
          <CreateBattleForm songs={artistSongs} />
        )}
      </div>

      {matches.length === 0 ? (
        <div className="py-24 text-center text-white/30">
          <p className="text-xl font-semibold">No active battles right now.</p>
          <p className="mt-2 text-sm">
            {isArtist ? "Start the first battle using the button above!" : "Check back soon!"}
          </p>
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

