import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { auth } from "@/lib/auth";
import { getDemoTracks } from "@/lib/demoTracks";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { Suspense } from "react";
import VersusCard from "@/components/VersusCard";
import AnimatedBackdropClient from "@/components/backdrops/AnimatedBackdropClient";
import BattleRoyaleCard from "@/components/BattleRoyaleCard";
import CreateBattleForm from "@/components/CreateBattleForm";
import AdSlot from "@/components/ads/AdSlot";
import { tallyRounds } from "@/lib/verzuz";
import { getArtistDefenseCounters, getSongDefenseCounters } from "@/lib/versusDefense";
import WeeklySeasonBanner from "@/components/WeeklySeasonBanner";
import MainCardCountdown from "@/components/MainCardCountdown";
import { getWeekLabel, getMsUntilWeekReset, getWeeklyArtistTopN } from "@/lib/weeklyseason";

export const metadata = {
  title: "Versus Battles",
  description: "Vote on 1v1 track battles and Battle Royale showdowns. Discover the hottest music and help crown the next champion on Epic Music Space.",
};

const PAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days of recent results

function percentWidthClass(value: number) {
  const snapped = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  return `u-pct-${snapped}`;
}

const getBattles = unstable_cache(
  async () => {
    const songSelect = {
      id: true,
      title: true,
      artist: true,
      genre: true,
      versusWins: true,
      versusLosses: true,
      coverUrl: true,
      aiScore: true,
    } as const;
    const recentSince = new Date(Date.now() - PAST_WINDOW_MS);

    const [activeMatches, activeRoyales, pastMatches, pastRoyales] = await Promise.all([
      prisma.versusMatch.findMany({
        where: { status: "ACTIVE" },
        include: { songA: { select: songSelect }, songB: { select: songSelect } },
        orderBy: { endsAt: "asc" },
        take: 30,
      }),
      prisma.battleRoyale.findMany({
        where: { status: "ACTIVE" },
        include: {
          entries: {
            include: { song: { select: songSelect } },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { endsAt: "asc" },
        take: 30,
      }),
      prisma.versusMatch.findMany({
        where: { status: "COMPLETED", endsAt: { gte: recentSince } },
        include: { songA: { select: songSelect }, songB: { select: songSelect } },
        orderBy: { endsAt: "desc" },
        take: 8,
      }),
      prisma.battleRoyale.findMany({
        where: { status: "COMPLETED", endsAt: { gte: recentSince } },
        include: {
          entries: {
            include: { song: { select: songSelect } },
            orderBy: { votes: "desc" },
          },
        },
        orderBy: { endsAt: "desc" },
        take: 8,
      }),
    ]);

    return { activeMatches, activeRoyales, pastMatches, pastRoyales };
  },
  ["versus-battles-v2"],
  { revalidate: 30, tags: [CACHE_TAGS.battles] },
);

export default async function VersusPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>;
}) {
  const { genre } = await searchParams;
  const activeGenre = (genre ?? "all").trim().toLowerCase();
  const session = await auth();
  const previewTracks = await getDemoTracks();
  const previewA = previewTracks[0];
  const previewB = previewTracks[1] ?? previewTracks[0];

  const isArtist =
    Boolean(session?.user?.id) && session!.user.role !== "LISTENER";

  const [{ activeMatches, activeRoyales, pastMatches, pastRoyales }, artistSongs, verzuzMatches, topBattlersRaw, seasonalSongs] = await Promise.all([
    getBattles(),
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
    prisma.user.findMany({
      where: {
        role: { in: ["ARTIST", "LABEL"] },
        songs: { some: { isActive: true } },
      },
      select: {
        id: true,
        name: true,
        image: true,
        studio: { select: { username: true, district: true } },
        songs: {
          where: { isActive: true },
          select: { versusWins: true, versusLosses: true, genre: true },
        },
      },
      take: 120,
    }),
    prisma.song.findMany({
      where: { isActive: true, genre: { not: null } },
      select: {
        id: true,
        title: true,
        artist: true,
        genre: true,
        versusWins: true,
        versusLosses: true,
      },
      orderBy: [{ versusWins: "desc" }, { aiScore: "desc" }],
      take: 400,
    }),
  ]);

  // Get user votes for both active and recent battles so the past results
  // also reflect "you voted X."
  let userVotes: Record<string, string> = {};
  let userRoyaleVotes: Record<string, string> = {};
  if (session?.user?.id) {
    const allMatchIds = [...activeMatches, ...pastMatches].map((m) => m.id);
    const allRoyaleIds = [...activeRoyales, ...pastRoyales].map((r) => r.id);
    const [votes, royaleVotes] = await Promise.all([
      prisma.versusVote.findMany({
        where: { userId: session.user.id, matchId: { in: allMatchIds } },
      }),
      prisma.battleRoyaleVote.findMany({
        where: { userId: session.user.id, battleId: { in: allRoyaleIds } },
      }),
    ]);
    userVotes = Object.fromEntries(votes.map((v) => [v.matchId, v.votedSongId]));
    userRoyaleVotes = Object.fromEntries(royaleVotes.map((v) => [v.battleId, v.songId]));
  }

  // Bucket active battles by urgency. <=1h to endsAt = "Ending soon" so the
  // user can drop in and influence a result; >1h = "Now playing" general feed.
  type BattleItem =
    | { type: "1v1"; endsAt: Date; data: (typeof activeMatches)[0] }
    | { type: "royale"; endsAt: Date; data: (typeof activeRoyales)[0] };

  const ENDING_SOON_MS = 60 * 60 * 1000;
  const now = Date.now();
  const allActive: BattleItem[] = [
    ...activeMatches.map((m) => ({ type: "1v1" as const, endsAt: m.endsAt, data: m })),
    ...activeRoyales.map((r) => ({ type: "royale" as const, endsAt: r.endsAt, data: r })),
  ].sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime());

  const endingSoon = allActive.filter(
    (b) => b.endsAt.getTime() - now <= ENDING_SOON_MS && b.endsAt.getTime() > now,
  );
  const nowPlaying = allActive.filter(
    (b) => b.endsAt.getTime() - now > ENDING_SOON_MS,
  );

  type PastItem =
    | { type: "1v1"; endsAt: Date; data: (typeof pastMatches)[0] }
    | { type: "royale"; endsAt: Date; data: (typeof pastRoyales)[0] };

  const recentResults: PastItem[] = [
    ...pastMatches.map((m) => ({ type: "1v1" as const, endsAt: m.endsAt, data: m })),
    ...pastRoyales.map((r) => ({ type: "royale" as const, endsAt: r.endsAt, data: r })),
  ]
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())
    .slice(0, 10);

  const discoveredGenres = Array.from(
    new Set(
      [
        ...activeMatches.flatMap((m) => [m.songA.genre, m.songB.genre]),
        ...pastMatches.flatMap((m) => [m.songA.genre, m.songB.genre]),
        ...activeRoyales.flatMap((r) => r.entries.map((e) => e.song.genre)),
        ...pastRoyales.flatMap((r) => r.entries.map((e) => e.song.genre)),
      ]
        .filter((g): g is string => typeof g === "string" && g.trim().length > 0)
        .map((g) => g.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const normalizedGenre =
    activeGenre !== "all" && discoveredGenres.some((g) => g.toLowerCase() === activeGenre)
      ? activeGenre
      : "all";

  function battleMatchesGenre(item: BattleItem | PastItem) {
    if (normalizedGenre === "all") return true;
    if (item.type === "1v1") {
      return (
        item.data.songA.genre?.toLowerCase() === normalizedGenre
        || item.data.songB.genre?.toLowerCase() === normalizedGenre
      );
    }
    return item.data.entries.some((e) => e.song.genre?.toLowerCase() === normalizedGenre);
  }

  const endingSoonFiltered = endingSoon.filter((b) => battleMatchesGenre(b));
  const nowPlayingFiltered = nowPlaying.filter((b) => battleMatchesGenre(b));
  const recentResultsFiltered = recentResults.filter((b) => battleMatchesGenre(b));

  const recapCards = recentResultsFiltered.slice(0, 4).map((item) => {
    if (item.type === "1v1") {
      const winner = item.data.votesA >= item.data.votesB ? item.data.songA : item.data.songB;
      const loser = winner.id === item.data.songA.id ? item.data.songB : item.data.songA;
      const winnerVotes = Math.max(item.data.votesA, item.data.votesB);
      const loserVotes = Math.min(item.data.votesA, item.data.votesB);
      const totalVotes = item.data.votesA + item.data.votesB;
      const winnerPct = totalVotes > 0 ? Math.round((winnerVotes / totalVotes) * 100) : 50;
      const recap = `${winner.title} beat ${loser.title} ${winnerVotes}-${loserVotes}. ${winner.artist} took ${winnerPct}% of the vote.`;
      return {
        id: item.data.id,
        tag: "1v1 Recap",
        headline: `${winner.title} over ${loser.title}`,
        subline: `${winner.artist} won ${winnerVotes}-${loserVotes} (${winnerPct}%)`,
        href: `/timeline?battle=${encodeURIComponent(item.data.id)}&focus=debate&recap=${encodeURIComponent(recap)}`,
      };
    }

    const leader = item.data.entries[0];
    const runnerUp = item.data.entries[1];
    const recap = leader
      ? `${leader.song.title} won the royale against ${item.data.entries.length} tracks.${runnerUp ? ` Runner-up was ${runnerUp.song.title}.` : ""}`
      : `Royale wrapped with ${item.data.entries.length} tracks in play.`;
    return {
      id: item.data.id,
      tag: "Royale Recap",
      headline: leader
        ? `${leader.song.title} topped ${item.data.entries.length} tracks`
        : `Royale wrapped with ${item.data.entries.length} tracks`,
      subline: leader
        ? `${leader.song.artist} finished first${runnerUp ? ` · runner-up ${runnerUp.song.title}` : ""}`
        : "No placement data yet",
      href: `/timeline?battle=${encodeURIComponent(item.data.id)}&focus=debate&recap=${encodeURIComponent(recap)}`,
    };
  });

  const seasonImpactCards = recentResultsFiltered.slice(0, 4).map((item) => {
    if (item.type === "1v1") {
      const winner = item.data.votesA >= item.data.votesB ? item.data.songA : item.data.songB;
      const loser = winner.id === item.data.songA.id ? item.data.songB : item.data.songA;
      const margin = Math.abs(item.data.votesA - item.data.votesB);
      return {
        id: item.data.id,
        href: `/versus/${item.data.id}`,
        title: `${winner.title} moved up the ladder`,
        subline: `${winner.artist} beat ${loser.artist} by ${margin} vote${margin === 1 ? "" : "s"}.`,
        impact: margin <= 2 ? "Playoff bubble pressure increased" : "Division seed stabilized",
      };
    }

    const leader = item.data.entries[0];
    return {
      id: item.data.id,
      href: `/versus/royale/${item.data.id}`,
      title: leader ? `${leader.song.title} captured royale points` : "Royale points updated",
      subline: leader ? `${leader.song.artist} now has momentum into next matchup.` : "Check placements for seed movement.",
      impact: "Genre board points redistributed",
    };
  });

  const weeklyCreatorMissions = [
    {
      id: "mission-1",
      label: "Win 2 battles in your division",
      reward: "+ discovery boost for 48h",
      href: "/versus",
    },
    {
      id: "mission-2",
      label: "Host 1 live session after a battle",
      reward: "+ session placement in Timeline",
      href: "/studio/live",
    },
    {
      id: "mission-3",
      label: "Post 3 battle recaps on Timeline",
      reward: "+ creator mission badge",
      href: "/timeline?focus=debate",
    },
  ] as const;

  const fanRoles = [
    { id: "role-1", title: "Battle Scout", unlock: "Vote in 5 live battles" },
    { id: "role-2", title: "Clutch Caller", unlock: "React during final-minute flips" },
    { id: "role-3", title: "Genre Curator", unlock: "Support 3 genres in one week" },
  ] as const;

  const topBattlers = topBattlersRaw
    .map((u) => {
      const wins = u.songs.reduce((sum, s) => sum + s.versusWins, 0);
      const losses = u.songs.reduce((sum, s) => sum + s.versusLosses, 0);
      const total = wins + losses;
      return {
        id: u.id,
        name: u.name ?? "Unknown Artist",
        image: u.image,
        username: u.studio?.username ?? null,
        wins,
        losses,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      };
    })
    .filter((u) => u.total >= 3)
    .sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate))
    .slice(0, 6);

  const nowUtc = new Date();
  const seasonQuarter = Math.floor(nowUtc.getUTCMonth() / 3) + 1;
  const seasonLabel = `${nowUtc.getUTCFullYear()} Season Q${seasonQuarter}`;

  const seasonStandings = topBattlersRaw
    .map((u) => {
      const wins = u.songs.reduce((sum, s) => sum + s.versusWins, 0);
      const losses = u.songs.reduce((sum, s) => sum + s.versusLosses, 0);
      const total = wins + losses;
      const byGenre = u.songs.reduce<Record<string, number>>((acc, s) => {
        const key = (s.genre ?? "Open").trim() || "Open";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const division =
        Object.entries(byGenre)
          .sort((a, b) => b[1] - a[1])[0]?.[0]
        ?? "Open";
      return {
        id: u.id,
        name: u.name ?? "Unknown Artist",
        image: u.image,
        username: u.studio?.username ?? null,
        district: u.studio?.district ?? null,
        division,
        wins,
        losses,
        total,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
      };
    })
    .filter((u) => u.total >= 3)
    .sort((a, b) => (b.wins - a.wins) || (b.winRate - a.winRate));

  const divisionLeaders = Array.from(
    seasonStandings.reduce((map, row) => {
      if (!map.has(row.division)) map.set(row.division, [] as typeof seasonStandings);
      map.get(row.division)!.push(row);
      return map;
    }, new Map<string, typeof seasonStandings>()),
  )
    .map(([division, rows]) => ({ division, rows: rows.slice(0, 3) }))
    .sort((a, b) => b.rows[0].wins - a.rows[0].wins)
    .slice(0, 4);

  const playoffSeeds = seasonStandings.slice(0, 8);

  const genreBelts = Array.from(
    seasonalSongs.reduce((map, s) => {
      const genre = (s.genre ?? "Open").trim() || "Open";
      const total = s.versusWins + s.versusLosses;
      if (total < 2) return map;
      const winRate = Math.round((s.versusWins / total) * 100);
      const current = map.get(genre);
      const candidate = {
        genre,
        title: s.title,
        artist: s.artist,
        wins: s.versusWins,
        losses: s.versusLosses,
        winRate,
      };
      if (!current || candidate.wins > current.wins || (candidate.wins === current.wins && candidate.winRate > current.winRate)) {
        map.set(genre, candidate);
      }
      return map;
    }, new Map<string, {
      genre: string;
      title: string;
      artist: string;
      wins: number;
      losses: number;
      winRate: number;
    }>()),
  )
    .map(([, champ]) => champ)
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 6);

  const titleDefenseWatch = activeMatches
    .map((m) => {
      const leader = m.votesA >= m.votesB ? m.songA : m.songB;
      const trailing = m.votesA >= m.votesB ? m.songB : m.songA;
      const leaderBattles = leader.versusWins + leader.versusLosses;
      if (leaderBattles < 5 || leader.versusWins < 3) return null;
      const challengerWinRate =
        trailing.versusWins + trailing.versusLosses > 0
          ? Math.round((trailing.versusWins / (trailing.versusWins + trailing.versusLosses)) * 100)
          : 0;
      return {
        matchId: m.id,
        leaderSongId: leader.id,
        leaderSong: leader.title,
        leaderArtist: leader.artist,
        leaderRecord: `${leader.versusWins}-${leader.versusLosses}`,
        challengerSong: trailing.title,
        challengerArtist: trailing.artist,
        challengerRecord: `${trailing.versusWins}-${trailing.versusLosses}`,
        challengerWinRate,
        endsAt: m.endsAt,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
    .slice(0, 4);

  const [artistDefenseCounters, songDefenseCounters] = await Promise.all([
    getArtistDefenseCounters(topBattlers.map((artist) => artist.id)),
    getSongDefenseCounters(titleDefenseWatch.map((watch) => watch.leaderSongId)),
  ]);

  const topBattlersWithDefense = topBattlers.map((artist) => {
    const counters = artistDefenseCounters[artist.id] ?? { streak: 0, total: 0 };
    return {
      ...artist,
      defenseStreak: counters.streak,
      defenseTotal: counters.total,
    };
  });

  const titleDefenseWatchWithStats = titleDefenseWatch.map((watch) => {
    const counters = songDefenseCounters[watch.leaderSongId] ?? { streak: 0, total: 0, artistId: "" };
    return {
      ...watch,
      defenseStreak: counters.streak,
      defenseTotal: counters.total,
    };
  });

  // ── Weekly season leaderboard data for banner ────────────────────────
  const weeklyArtistEntries = await getWeeklyArtistTopN(3);
  const weeklyArtistIds = weeklyArtistEntries.map((e) => e.id);
  const weeklyArtistUsers =
    weeklyArtistIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: weeklyArtistIds } },
          select: { id: true, name: true },
        })
      : [];
  const weeklyNameMap = new Map(weeklyArtistUsers.map((u) => [u.id, u.name ?? "Artist"]));
  const weeklyTopArtists = weeklyArtistEntries.map((e) => ({
    name: weeklyNameMap.get(e.id) ?? "Artist",
    points: e.points,
  }));
  const weekLabel = getWeekLabel();
  const weekResetMs = getMsUntilWeekReset();
  const weekRenderedAt = Date.now();

  // ── Pick the top active 1v1 as tonight's featured Main Event ───────────
  const mainEvent = allActive.find((b) => b.type === "1v1") ?? null;

  const judgeNow = allActive.slice(0, 3);

  const isEmpty = endingSoonFiltered.length === 0
    && nowPlayingFiltered.length === 0
    && recentResultsFiltered.length === 0;

  return (
    <div className="ems-shell-wide">
      <Suspense><AdSlot location="VERSUS_BANNER" className="mb-8" /></Suspense>
      <header className="ems-head">
        <p className="ems-kicker">Battle Arena</p>
        <p className="ems-sub">Live ladders, season stakes, and recap-ready outcomes in one place.</p>
        <div className="ems-divider" />
      </header>

      {/* ── Weekly season banner ── */}
      <WeeklySeasonBanner
        weekLabel={weekLabel}
        resetMs={weekResetMs}
        renderedAt={weekRenderedAt}
        topArtists={weeklyTopArtists}
        liveMatchCount={allActive.length}
      />
      {/* ── Header — premium, high-contrast, single confident statement ── */}
      <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#1a0530] via-[#0d0220] to-[#000] px-6 py-10 sm:px-10 sm:py-12 shadow-[0_30px_120px_-40px_rgba(255,45,146,0.45)]">
        <AnimatedBackdropClient variant="versus" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.32em] text-accent-300/90">
              Live competition
            </p>
            <h1 className="font-bebas-neue text-5xl leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
              <span className="bg-gradient-to-br from-white via-white to-accent-200 bg-clip-text text-transparent">VS</span>{" "}
              <span className="ml-1 bg-gradient-to-br from-accent-400 via-pink-400 to-brand-400 bg-clip-text text-transparent">Battles</span>
            </h1>
            <p className="mt-4 text-base text-white/85 drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:text-lg">
              Two tracks. One winner. Every vote moves the discovery ranking — and the room watches it happen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/versus/season"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/45 bg-emerald-500/12 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-emerald-100 hover:bg-emerald-500/20 transition"
            >
              Season Circuit
            </Link>
            <Link
              href="/auth/signin?callbackUrl=/verzuz/new"
              className="inline-flex items-center gap-2 rounded-xl border border-gold-400/45 bg-gold-400/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-gold-100 hover:bg-gold-400/20 transition"
            >
              Verzuz · 10-round series
            </Link>
            {isArtist && <CreateBattleForm songs={artistSongs} />}
          </div>
        </div>
      </div>

      {/* ── Artist CTA banner ─ */}
      {isArtist && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-accent-500/30 bg-accent-500/[0.08] px-5 py-4">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-wider text-accent-200">
              Ready to battle?
            </p>
            <p className="mt-1 text-sm text-white/75">
              {artistSongs.length >= 2
                ? "Pick 2–10 of your songs and let the community decide."
                : "Upload at least 2 songs, then start a 1v1 or Battle Royale."}
            </p>
          </div>
          <CreateBattleForm songs={artistSongs} />
        </div>
      )}

      {!session?.user?.id && (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
          <p className="text-sm text-white/80">Sign in to vote and create battles.</p>
          <a
            href="/auth/signin?callbackUrl=/versus"
            className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600 transition"
          >
            Sign in
          </a>
        </div>
      )}

      {/* ── Tonight's Main Event — top active 1v1 in UFC main-card style ── */}
      {mainEvent && mainEvent.type === "1v1" && (() => {
        const m = mainEvent.data;
        const totalVotes = m.votesA + m.votesB;
        const pctA = totalVotes > 0 ? Math.round((m.votesA / totalVotes) * 100) : 50;
        const pctB = 100 - pctA;
        return (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-200/90">
                Tonight&apos;s Main Event
              </p>
            </div>
            <Link
              href={`/versus/${m.id}`}
              className="group block overflow-hidden rounded-3xl border border-rose-400/25 bg-gradient-to-br from-[#1a0a14] via-[#12070f] to-[#0a0010] p-5 shadow-[0_20px_80px_-20px_rgba(255,45,100,0.3)] transition hover:border-rose-400/40"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-200">
                  Main Card · 1v1
                </span>
                <span className="text-[11px]">
                  <MainCardCountdown endsAt={mainEvent.endsAt.toISOString()} />
                </span>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                {/* Fighter A */}
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/20 text-xl">
                    🎵
                  </div>
                  <p className="line-clamp-2 text-sm font-black leading-tight text-white">{m.songA.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/50">{m.songA.artist}</p>
                  <p className="mt-1 text-[10px] font-semibold text-brand-300">
                    {m.songA.versusWins}W‑{m.songA.versusLosses}L
                  </p>
                </div>
                {/* VS divider */}
                <div className="flex flex-col items-center gap-1 px-1">
                  <span className="text-2xl font-black tracking-tight text-white/80">VS</span>
                  <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase text-white/40">
                    {m.songA.genre ?? "Open"}
                  </span>
                </div>
                {/* Fighter B */}
                <div className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-500/20 text-xl">
                    🎵
                  </div>
                  <p className="line-clamp-2 text-sm font-black leading-tight text-white">{m.songB.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-white/50">{m.songB.artist}</p>
                  <p className="mt-1 text-[10px] font-semibold text-accent-300">
                    {m.songB.versusWins}W‑{m.songB.versusLosses}L
                  </p>
                </div>
              </div>
              {/* Vote bar */}
              <div className="mt-5">
                <div className="mb-1 flex justify-between text-[10px] font-bold">
                  <span className="text-brand-300">{pctA}%</span>
                  <span className="text-white/35">{totalVotes} votes cast</span>
                  <span className="text-accent-300">{pctB}%</span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full">
                  <div className={`bg-brand-500 transition-all ${percentWidthClass(pctA)}`} />
                  <div className={`bg-accent-500 transition-all ${percentWidthClass(pctB)}`} />
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] font-black uppercase tracking-widest text-white/40 transition group-hover:text-white/75">
                Cast Your Vote →
              </p>
            </Link>
          </section>
        );
      })()}

      <section className="mb-8 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/90">Daily Loop</p>
            <h2 className="mt-1 text-lg font-extrabold text-white">Judge Right Now</h2>
          </div>
          <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
            {judgeNow.length} picks
          </span>
        </div>
        {judgeNow.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {judgeNow.map((b) => {
              if (b.type === "1v1") {
                const mins = Math.max(1, Math.round((b.endsAt.getTime() - now) / 60000));
                return (
                  <Link
                    key={b.data.id}
                    href={`/versus/${b.data.id}`}
                    className="rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 transition hover:border-white/25 hover:bg-white/6"
                  >
                    <p className="text-[10px] uppercase tracking-wider text-white/45">1v1 • {mins}m left</p>
                    <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{b.data.songA.title} vs {b.data.songB.title}</p>
                    <p className="mt-1 text-[11px] text-white/45">{b.data.songA.genre ?? b.data.songB.genre ?? "Open genre"}</p>
                  </Link>
                );
              }
              const mins = Math.max(1, Math.round((b.endsAt.getTime() - now) / 60000));
              return (
                <Link
                  key={b.data.id}
                  href={`/versus/royale/${b.data.id}`}
                  className="rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 transition hover:border-white/25 hover:bg-white/6"
                >
                  <p className="text-[10px] uppercase tracking-wider text-white/45">Royale • {mins}m left</p>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{b.data.entries.length} songs in play</p>
                  <p className="mt-1 text-[11px] text-white/45">Community crown vote</p>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/60">No live picks right now. Check back shortly.</p>
        )}
      </section>

      <section className="mb-8 rounded-2xl border border-white/12 bg-white/[0.03] px-4 py-3">
        <p className="text-xs text-white/55">
          🛡️ Battle integrity: anti-spam vote throttles, self-vote blocks, and suspicious activity monitoring are active on every match.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <Link href="/support?topic=battle-trust" className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/70 hover:bg-white/10">
            Why this match is trusted
          </Link>
          <Link href="/support?topic=battle-integrity" className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-white/70 hover:bg-white/10">
            Report suspicious battle
          </Link>
        </div>
      </section>

      {seasonImpactCards.length > 0 && (
        <section className="mb-8 rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.07] p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200/85">Stakes Engine</p>
              <h2 className="mt-1 text-lg font-extrabold text-white">What These Results Changed</h2>
            </div>
            <span className="rounded-full border border-indigo-400/35 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-black text-indigo-200">
              season impact
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {seasonImpactCards.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/6"
              >
                <p className="text-[10px] uppercase tracking-wider text-indigo-200/80">Rank movement</p>
                <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{card.title}</p>
                <p className="mt-1 line-clamp-1 text-[11px] text-white/55">{card.subline}</p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-indigo-200">{card.impact}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Filter by genre</p>
          {normalizedGenre !== "all" && (
            <Link href="/versus" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
              Reset
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/versus"
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              normalizedGenre === "all"
                ? "border-brand-500/60 bg-brand-500/20 text-brand-200"
                : "border-white/15 text-white/60 hover:bg-white/8"
            }`}
          >
            All
          </Link>
          {discoveredGenres.map((g) => {
            const lower = g.toLowerCase();
            const active = lower === normalizedGenre;
            return (
              <Link
                key={g}
                href={`/versus?genre=${encodeURIComponent(g)}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-brand-500/60 bg-brand-500/20 text-brand-200"
                    : "border-white/15 text-white/60 hover:bg-white/8"
                }`}
              >
                {g}
              </Link>
            );
          })}
        </div>
      </section>

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

      {topBattlersWithDefense.length > 0 && (
        <section className="mb-10 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black uppercase tracking-[0.2em] text-amber-200">⚔️ Battle Ladder</h2>
              <p className="text-xs text-white/50">Artists with the strongest 1v1 records.</p>
            </div>
            <Link
              href="/leaderboard?type=artists"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/65 hover:bg-white/10"
            >
              Full Leaderboard →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {topBattlersWithDefense.map((artist, idx) => (
              <Link
                key={artist.id}
                href={artist.username ? `/studio/${artist.username}` : "/leaderboard?type=artists"}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/6"
              >
                <span className="w-5 text-center text-xs font-black text-amber-300">#{idx + 1}</span>
                <div className="relative h-9 w-9 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                  {artist.image ? (
                    <Image src={artist.image} alt="" fill unoptimized className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm">🎤</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{artist.name}</p>
                  <p className="text-[11px] text-white/45">{artist.wins}W-{artist.losses}L · {artist.winRate}% win rate</p>
                  {(artist.defenseTotal > 0 || artist.defenseStreak > 0) && (
                    <p className="text-[10px] font-semibold text-amber-200/80">
                      {artist.defenseTotal} title defenses · streak {artist.defenseStreak}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seasonStandings.length > 0 && (
        <section className="mb-10 rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.08] via-black/20 to-cyan-500/[0.06] p-5">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200/90">Season Mechanics</p>
              <h2 className="mt-1 text-2xl font-extrabold text-white">{seasonLabel}</h2>
              <p className="mt-1 text-xs text-white/55">Divisions, belt holders, and current playoff seeds update from live battle records.</p>
            </div>
            <Link
              href="/versus/season"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/75 hover:bg-white/10"
            >
              Open Full Season Board →
            </Link>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {divisionLeaders.map((div) => (
              <div key={div.division} className="rounded-xl border border-white/12 bg-black/20 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-200/80">{div.division} Division</p>
                {div.rows.map((row, idx) => (
                  <div key={row.id} className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-white/80">#{idx + 1} {row.name}</span>
                    <span className="font-semibold text-white/60">{row.wins}-{row.losses}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {playoffSeeds.length > 0 && (
            <div className="mb-4 rounded-xl border border-white/12 bg-black/20 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-white/50">Playoff Bracket Seeds</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {playoffSeeds.map((seed, idx) => (
                  <div key={seed.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs">
                    <p className="font-black text-emerald-200">Seed {idx + 1}</p>
                    <p className="mt-1 truncate font-semibold text-white/85">{seed.name}</p>
                    <p className="text-white/45">{seed.wins}W-{seed.losses}L · {seed.winRate}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {genreBelts.length > 0 && (
            <div className="rounded-xl border border-white/12 bg-black/20 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-200/80">Genre Belt Holders</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {genreBelts.map((belt) => (
                  <div key={`${belt.genre}:${belt.title}`} className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-2.5 py-2 text-xs">
                    <p className="font-black text-amber-200">🏆 {belt.genre}</p>
                    <p className="mt-1 truncate font-semibold text-white/85">{belt.title}</p>
                    <p className="truncate text-white/50">{belt.artist}</p>
                    <p className="mt-1 text-white/45">{belt.wins}W-{belt.losses}L · {belt.winRate}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {titleDefenseWatchWithStats.length > 0 && (
        <section className="mb-10 rounded-2xl border border-rose-400/25 bg-rose-500/[0.07] p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/85">Championship Watch</p>
              <h2 className="mt-1 text-lg font-extrabold text-white">Title Defenses In Play</h2>
            </div>
            <span className="rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-black text-rose-200">
              {titleDefenseWatchWithStats.length} live
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {titleDefenseWatchWithStats.map((m) => (
              <Link
                key={m.matchId}
                href={`/versus/${m.matchId}`}
                className="rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/6"
              >
                <p className="text-[10px] uppercase tracking-wider text-rose-200/80">Defense Candidate</p>
                <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{m.leaderSong}</p>
                <p className="text-[11px] text-white/55">{m.leaderArtist} · {m.leaderRecord}</p>
                <p className="mt-2 line-clamp-1 text-sm text-white/75">vs {m.challengerSong}</p>
                <p className="text-[11px] text-white/45">{m.challengerArtist} · {m.challengerRecord} ({m.challengerWinRate}% WR)</p>
                {(m.defenseTotal > 0 || m.defenseStreak > 0) && (
                  <p className="mt-1 text-[10px] font-semibold text-rose-200/85">
                    {m.defenseTotal} defenses · current streak {m.defenseStreak}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {recapCards.length > 0 && (
        <section className="mb-10 rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200/85">Story Loop</p>
              <h2 className="mt-1 text-lg font-extrabold text-white">Auto Recap Prompts</h2>
            </div>
            <Link
              href="/timeline?focus=debate"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/70 hover:bg-white/10"
            >
              Open Timeline →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {recapCards.map((card) => (
              <Link
                key={`${card.tag}:${card.id}`}
                href={card.href}
                className="rounded-xl border border-white/12 bg-black/25 px-3 py-2.5 transition hover:border-white/20 hover:bg-white/6"
              >
                <p className="text-[10px] uppercase tracking-wider text-cyan-200/80">{card.tag}</p>
                <p className="mt-1 line-clamp-1 text-sm font-semibold text-white">{card.headline}</p>
                <p className="mt-1 line-clamp-1 text-[11px] text-white/55">{card.subline}</p>
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-cyan-200">Post recap on Timeline</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/85">Creator Progression</p>
          <h2 className="mt-1 text-lg font-extrabold text-white">Weekly Missions</h2>
          <div className="mt-3 space-y-2">
            {weeklyCreatorMissions.map((mission) => (
              <Link key={mission.id} href={mission.href} className="block rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-xs hover:bg-white/6">
                <p className="font-semibold text-white/85">{mission.label}</p>
                <p className="mt-1 text-white/50">Reward: {mission.reward}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/85">Fan Identity Loop</p>
          <h2 className="mt-1 text-lg font-extrabold text-white">Prediction + Role Track</h2>
          <p className="mt-1 text-xs text-white/65">Build your streak by calling winners before lock. Roles unlock as you participate.</p>
          <div className="mt-3 space-y-2">
            {fanRoles.map((role) => (
              <div key={role.id} className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 text-xs">
                <p className="font-semibold text-white/85">{role.title}</p>
                <p className="mt-1 text-white/50">Unlock: {role.unlock}</p>
              </div>
            ))}
          </div>
          <Link href="/timeline?focus=debate" className="mt-3 inline-flex rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-400/20">
            Join prediction talk
          </Link>
        </div>
      </section>

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
                ? "Sign in to start a battle above — pit two of your tracks against each other and let the community vote."
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
        <div className="flex flex-col gap-12">
          {endingSoonFiltered.length > 0 && (
            <BattleSection
              eyebrow="Ending soon · less than an hour left"
              title={
                <>
                  <span className="inline-flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                    </span>
                    Closing now
                  </span>
                </>
              }
              count={endingSoonFiltered.length}
              accent="rose"
            >
              {endingSoonFiltered.map((item) =>
                renderBattle(item, userVotes, userRoyaleVotes),
              )}
            </BattleSection>
          )}

          {nowPlayingFiltered.length > 0 && (
            <BattleSection
              eyebrow="Now playing"
              title="Active battles"
              count={nowPlayingFiltered.length}
              accent="brand"
            >
              {nowPlayingFiltered.map((item) =>
                renderBattle(item, userVotes, userRoyaleVotes),
              )}
            </BattleSection>
          )}

          {recentResultsFiltered.length > 0 && (
            <BattleSection
              eyebrow={`Recent results · last ${Math.round(PAST_WINDOW_MS / (24 * 60 * 60 * 1000))} days`}
              title="Just finished"
              count={recentResultsFiltered.length}
              accent="muted"
            >
              {recentResultsFiltered.map((item) =>
                renderBattle(item, userVotes, userRoyaleVotes),
              )}
            </BattleSection>
          )}
        </div>
      )}
    </div>
  );
}

function renderBattle(
  item:
    | { type: "1v1"; data: { id: string; songA: SongPreview; songB: SongPreview; votesA: number; votesB: number; endsAt: Date } }
    | { type: "royale"; data: { id: string; entries: { id: string; songId: string; votes: number; position: number; song: SongPreview }[]; endsAt: Date } },
  userVotes: Record<string, string>,
  userRoyaleVotes: Record<string, string>,
) {
  if (item.type === "1v1") {
    return (
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
    );
  }
  return (
    <BattleRoyaleCard
      key={item.data.id}
      battleId={item.data.id}
      entries={item.data.entries}
      endsAt={item.data.endsAt.toISOString()}
      userVotedSongId={userRoyaleVotes[item.data.id] ?? null}
    />
  );
}

type SongPreview = {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  coverUrl: string | null;
  aiScore: number;
};

function BattleSection({
  eyebrow,
  title,
  count,
  accent,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  count: number;
  accent: "rose" | "brand" | "muted";
  children: React.ReactNode;
}) {
  const eyebrowColor =
    accent === "rose"
      ? "text-rose-300"
      : accent === "brand"
        ? "text-brand-300"
        : "text-white/45";
  const countColor =
    accent === "rose"
      ? "border-rose-500/35 bg-rose-500/10 text-rose-200"
      : accent === "brand"
        ? "border-brand-500/35 bg-brand-500/10 text-brand-200"
        : "border-white/10 bg-white/4 text-white/55";
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-white/8 pb-3">
        <div>
          <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${eyebrowColor}`}>
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-white">{title}</h2>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black tabular-nums ${countColor}`}
        >
          {count}
        </span>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}
