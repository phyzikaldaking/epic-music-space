import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import VersusCard from "@/components/VersusCard";
export const dynamic = "force-dynamic";
export default async function VersusPage() {
    var _a;
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
    let userVotes = {};
    if ((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id) {
        const votes = await prisma.versusVote.findMany({
            where: { userId: session.user.id, matchId: { in: matches.map((m) => m.id) } },
        });
        userVotes = Object.fromEntries(votes.map((v) => [v.matchId, v.votedSongId]));
    }
    return (<div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">⚔️ Versus</h1>
        <p className="mt-2 text-white/50">
          Vote for your favorite tracks. Winners rise in the discovery algorithm.
        </p>
      </div>

      {matches.length === 0 ? (<div className="py-24 text-center text-white/30">
          <p className="text-xl font-semibold">No active battles right now.</p>
          <p className="mt-2 text-sm">Check back soon!</p>
        </div>) : (<div className="flex flex-col gap-6">
          {matches.map((m) => {
                var _a;
                return (<VersusCard key={m.id} matchId={m.id} songA={m.songA} songB={m.songB} votesA={m.votesA} votesB={m.votesB} endsAt={m.endsAt.toISOString()} userVotedSongId={(_a = userVotes[m.id]) !== null && _a !== void 0 ? _a : null}/>);
            })}
        </div>)}
    </div>);
}
