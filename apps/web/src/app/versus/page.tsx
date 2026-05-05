import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { getDemoTracks } from "@/lib/demoTracks";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { Suspense } from "react";
import VersusCard from "@/components/VersusCard";
import BattleRoyaleCard from "@/components/BattleRoyaleCard";
import CreateBattleForm from "@/components/CreateBattleForm";
import AdSlot from "@/components/ads/AdSlot";
import { tallyRounds } from "@/lib/verzuz";

export const metadata = {
  title: "Versus Battles | Epic Music Space",
  description: "Vote on 1v1 track battles and Battle Royale showdowns. Discover the hottest music and help crown the next champion on Epic Music Space.",
};

const getActiveBattles = unstable_cache(
  async () => {
    const [matches, royales] = await Promise.all([
      prisma.versusMatch.findMany({
        where: { status: "ACTIVE" },
        include: {
          songA: {
            select: {
              id: true, title: true, artist: true,
              coverUrl: true, aiScore: true,
            },
          },
          songB: {
            select: {
              id: true, title: true, artist: true,
              coverUrl: true, aiScore: true,
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
                  coverUrl: true, aiScore: true,
                },
              },
            },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return { matches, royales };
  },
  ["versus-active-battles"],
  { revalidate: 30, tags: [CACHE_TAGS.battles] },
);

export default async function VersusPage() {
  const session = await auth();
  const previewTracks = await getDemoTracks();
  const previewA = previewTracks[0];
  const previewB = previewTracks[1] ?? previewTracks[0];

  const isArtist =
    Boolean(session?.user?.id) && session!.user.role !== "LISTENER";

  const [{ matches, royales }, artistSongs, verzuzMatches] = await Promise.all([
    getActiveBattles(),
    isArtist
      ? prisma.song.findMany({
          where: { artistId: session?.user?.id ?? "", isActive: true },
          select: { id: true, title: true, artist: true, coverUrl: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    prisma.verzuzMatch.findMany({
      where: { status: { in: ["LIVE", "SCHEDULED"] } },
      orderBy: [{ status: "asc" }, { startsAt: "asc" }],
      take: 4,
      select: {
        id: true,
        status: true,
        theme: true,
        totalRounds: true,
        startsAt: true,
        artistAName: true,
        artistBName: true,
        artistA: { select: { image: true } },
        artistB: { select: { image: true } },
        rounds: { select: { winner: true } },
        _count: { select: { votes: true } },
      },
    }),
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
      <Suspense><AdSlot location="VERSUS_BANNER" className="mb-8" /></Suspense>
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/verzuz/new"
              className="inline-flex items-center gap-2 rounded-xl border border-gold-500/35 bg-gold-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-gold-200 transition hover:bg-gold-500/20"
            >
              🏆 Verzuz · 10-round artist showdown
            </Link>
          </div>
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

      {verzuzMatches.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black uppercase tracking-[0.24em] text-gold-200">
                🏆 Verzuz
              </h2>
              <p className="text-xs text-white/45">
                10-round artist showdowns. Live + scheduled.
              </p>
            </div>
            <Link
              href="/verzuz"
              className="rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/8"
            >
              See all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {verzuzMatches.map((m) => {
              const score = tallyRounds(m.rounds);
              return (
                <Link
                  key={m.id}
                  href={`/verzuz/${m.id}`}
                  className={`group relative overflow-hidden rounded-2xl border p-4 transition ${
                    m.status === "LIVE"
                      ? "border-red-500/45 bg-red-500/8 hover:bg-red-500/12"
                      : "border-gold-400/25 bg-gold-400/5 hover:bg-gold-400/8"
                  }`}
                >
                  {m.status === "LIVE" ? (
                    <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/85 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      Live · {score.aWins}-{score.bWins}
                    </span>
                  ) : (
                    <span className="absolute right-3 top-3 rounded-full border border-gold-400/35 bg-gold-400/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-gold-200">
                      Soon
                    </span>
                  )}
                  <div className="flex items-center gap-3 pr-20">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                        {m.artistA.image ? (
                          <Image src={m.artistA.image} alt="" fill unoptimized className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm">🎤</span>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">{m.artistAName}</p>
                    </div>
                    <span className="text-[10px] font-black text-white/35">vs</span>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-pink-500 to-orange-500">
                        {m.artistB.image ? (
                          <Image src={m.artistB.image} alt="" fill unoptimized className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-sm">🎤</span>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-bold">{m.artistBName}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                    <span>
                      {m.totalRounds} rounds · {m._count.votes} {m._count.votes === 1 ? "vote" : "votes"}
                    </span>
                    <span className="font-bold text-white/65">
                      {m.status === "LIVE"
                        ? "Tap to watch"
                        : new Date(m.startsAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {isEmpty ? (
        <div className="py-10">
          {/* Demo preview card */}
          <div className="mb-6 rounded-2xl border border-white/8 bg-white/3 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full border border-accent-500/30 bg-accent-500/10 px-2.5 py-0.5 text-xs font-semibold text-accent-300">
                Sample Battle
              </span>
              <span className="text-xs text-white/30">How it works ↓</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Song A */}
              <div className="rounded-xl border border-white/8 bg-white/5 p-4">
                <div className="mb-2 h-16 w-16 rounded-lg bg-gradient-to-br from-brand-600 to-accent-600 flex items-center justify-center text-2xl">
                  🎵
                </div>
                <p className="font-semibold text-sm truncate">{previewA?.title ?? "Featured Beat"}</p>
                <p className="text-xs text-white/40 truncate">{previewA?.artist ?? "Epic Music Space"}</p>
                <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                  <div className="h-1.5 w-[62%] rounded-full bg-brand-500" />
                </div>
                <p className="mt-1 text-xs text-white/40">62% of votes</p>
              </div>
              {/* VS divider */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-black text-accent-400">VS</span>
                <span className="text-xs text-white/30">1v1</span>
              </div>
              {/* Song B */}
              <div className="rounded-xl border border-white/8 bg-white/5 p-4">
                <div className="mb-2 h-16 w-16 rounded-lg bg-gradient-to-br from-pink-600 to-orange-500 flex items-center justify-center text-2xl">
                  🎵
                </div>
                <p className="font-semibold text-sm truncate">{previewB?.title ?? "Next Up"}</p>
                <p className="text-xs text-white/40 truncate">{previewB?.artist ?? "Epic Music Space"}</p>
                <div className="mt-3 h-1.5 w-full rounded-full bg-white/10">
                  <div className="h-1.5 w-[38%] rounded-full bg-pink-500" />
                </div>
                <p className="mt-1 text-xs text-white/40">38% of votes</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xl font-semibold text-white/60">No active battles right now.</p>
            <p className="mt-2 text-sm text-white/35 max-w-sm mx-auto">
              {isArtist
                ? "Start a battle above — pit two of your tracks against each other and let the community vote."
                : session?.user?.id
                  ? "Check back soon! Artists are setting up battles. Meanwhile, browse the marketplace."
                  : "Sign up as an artist to start battles, or join as a listener to vote when battles go live."}
            </p>
            {!session?.user?.id && (
              <div className="mt-5 flex justify-center gap-3">
                <a href="/auth/signup?role=ARTIST" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 transition">
                  Join as Artist
                </a>
                <a href="/marketplace" className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/8 transition">
                  Browse Tracks
                </a>
              </div>
            )}
          </div>
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
