import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import AdSlot from "@/components/ads/AdSlot";
import { getWeekLabel, getMsUntilWeekReset, getWeeklyArtistTopN, getWeeklyFanTopN, getWeekBounds } from "@/lib/weeklyseason";

export const metadata: Metadata = {
  title: "Versus Season Circuit",
  description:
    "Season standings, division leaders, and playoff seeds for Epic Music Space battles.",
};

type StandingRow = {
  id: string;
  name: string;
  image: string | null;
  username: string | null;
  district: string | null;
  division: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
};

type ProjectedMatch = {
  id: string;
  label: string;
  a: StandingRow;
  b: StandingRow;
  winner: StandingRow;
  edge: number;
};

function matchupScore(seed: StandingRow): number {
  return (seed.winRate * 100) + (seed.wins * 4) + seed.total;
}

function projectWinner(a: StandingRow, b: StandingRow) {
  const scoreA = matchupScore(a);
  const scoreB = matchupScore(b);
  if (scoreA === scoreB) {
    const winner = a.id < b.id ? a : b;
    const loser = winner.id === a.id ? b : a;
    return { winner, loser, edge: 0 };
  }
  if (scoreA > scoreB) {
    return { winner: a, loser: b, edge: scoreA - scoreB };
  }
  return { winner: b, loser: a, edge: scoreB - scoreA };
}

export default async function VersusSeasonPage() {
  const users = await prisma.user.findMany({
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
    take: 250,
  });

  const nowUtc = new Date();
  const seasonQuarter = Math.floor(nowUtc.getUTCMonth() / 3) + 1;
  const seasonLabel = `${nowUtc.getUTCFullYear()} Season Q${seasonQuarter}`;

  // ── Weekly leaders ────────────────────────────────────────────────────
  const weekLabel = getWeekLabel();
  const weekResetMs = getMsUntilWeekReset();
  const { start: weekStart } = getWeekBounds();

  const [weeklyArtistEntries, weeklyFanEntries, weeklyMatchWins] = await Promise.all([
    getWeeklyArtistTopN(5),
    getWeeklyFanTopN(5),
    prisma.versusMatch.findMany({
      where: { status: "COMPLETED", endsAt: { gte: weekStart } },
      select: {
        songA: { select: { artistId: true } },
        songB: { select: { artistId: true } },
        votesA: true,
        votesB: true,
      },
    }),
  ]);

  // Tally actual wins from Prisma this week (independent of Redis pts)
  const weeklyWinTally = new Map<string, number>();
  for (const m of weeklyMatchWins) {
    const winnerArtistId = m.votesA >= m.votesB ? m.songA.artistId : m.songB.artistId;
    if (!winnerArtistId) continue;
    weeklyWinTally.set(winnerArtistId, (weeklyWinTally.get(winnerArtistId) ?? 0) + 1);
  }

  // Hydrate artist names for Redis entries
  const artistIdsToHydrate = weeklyArtistEntries.map((e) => e.id);
  const fanIdsToHydrate = weeklyFanEntries.map((e) => e.id);
  const [weeklyArtistUsers, weeklyFanUsers] = await Promise.all([
    artistIdsToHydrate.length > 0
      ? prisma.user.findMany({
          where: { id: { in: artistIdsToHydrate } },
          select: { id: true, name: true, image: true },
        })
      : Promise.resolve([]),
    fanIdsToHydrate.length > 0
      ? prisma.user.findMany({
          where: { id: { in: fanIdsToHydrate } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const artistNameMap = new Map(weeklyArtistUsers.map((u) => [u.id, u.name ?? "Artist"]));
  const fanNameMap = new Map(weeklyFanUsers.map((u) => [u.id, u.name ?? "Fan"]));

  // Formatted reset string
  const weekResetSecs = Math.floor(weekResetMs / 1_000);
  const weekResetH = Math.floor(weekResetSecs / 3_600);
  const weekResetD = Math.floor(weekResetH / 24);
  const weekResetLabel =
    weekResetD > 0 ? `${weekResetD}d ${weekResetH % 24}h` :
    weekResetH > 0 ? `${weekResetH}h ${Math.floor((weekResetSecs % 3_600) / 60)}m` :
    `${Math.floor(weekResetSecs / 60)}m`;

  const standings: StandingRow[] = users
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

  const divisions = Array.from(
    standings.reduce((map, row) => {
      if (!map.has(row.division)) map.set(row.division, [] as StandingRow[]);
      map.get(row.division)!.push(row);
      return map;
    }, new Map<string, StandingRow[]>()),
  )
    .map(([division, rows]) => ({ division, rows: rows.slice(0, 8) }))
    .sort((a, b) => b.rows[0].wins - a.rows[0].wins);

  const seeds = standings.slice(0, 8);
  const quarterFinals = [
    [seeds[0], seeds[7]],
    [seeds[3], seeds[4]],
    [seeds[2], seeds[5]],
    [seeds[1], seeds[6]],
  ].filter((p) => p[0] && p[1]);

  const projectedQuarterFinals: ProjectedMatch[] = quarterFinals.map(([a, b], idx) => {
    const projection = projectWinner(a, b);
    return {
      id: `qf-${idx + 1}`,
      label: `Quarterfinal ${idx + 1}`,
      a,
      b,
      winner: projection.winner,
      edge: projection.edge,
    };
  });

  const projectedSemiFinals: ProjectedMatch[] =
    projectedQuarterFinals.length === 4
      ? [
          [projectedQuarterFinals[0].winner, projectedQuarterFinals[1].winner],
          [projectedQuarterFinals[2].winner, projectedQuarterFinals[3].winner],
        ].map(([a, b], idx) => {
          const projection = projectWinner(a, b);
          return {
            id: `sf-${idx + 1}`,
            label: `Semifinal ${idx + 1}`,
            a,
            b,
            winner: projection.winner,
            edge: projection.edge,
          };
        })
      : [];

  const projectedFinal: ProjectedMatch | null =
    projectedSemiFinals.length === 2
      ? (() => {
          const a = projectedSemiFinals[0].winner;
          const b = projectedSemiFinals[1].winner;
          const projection = projectWinner(a, b);
          return {
            id: "final-1",
            label: "Final",
            a,
            b,
            winner: projection.winner,
            edge: projection.edge,
          };
        })()
      : null;

  const rewardTiers = [
    {
      title: "Champion Belt",
      placement: "Seed #1 finishes playoffs",
      rewards: ["Homepage spotlight", "Verified champion badge", "Featured timeline recap"],
    },
    {
      title: "Final Four",
      placement: "Top 4 playoff finish",
      rewards: ["Battle ladder boost", "Priority challenge visibility", "Creator profile highlight"],
    },
    {
      title: "Division Leader",
      placement: "#1 in division at cutoff",
      rewards: ["Division banner tag", "Weekly recommendation rail", "Season contender label"],
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Suspense>
        <AdSlot location="VERSUS_BANNER" className="mb-8" />
      </Suspense>

      {/* ── THIS WEEK: live weekly leaders + countdown ── */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/[0.07] via-black/10 to-rose-500/[0.05]">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-amber-200/90">
              This Week
            </p>
            <span className="text-[11px] font-bold text-white/50">{weekLabel}</span>
          </div>
          <span className="text-[11px] tabular-nums text-white/35">
            Resets in {weekResetLabel}
          </span>
        </div>

        <div className="grid gap-0 sm:grid-cols-2">
          {/* Artist weekly leaders */}
          <div className="px-5 py-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/70">
              Artist Leaders
            </p>
            {weeklyArtistEntries.length > 0 ? (
              <ol className="space-y-2">
                {weeklyArtistEntries.map((entry, i) => (
                  <li key={entry.id} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center text-[10px] font-black text-white/25">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/80">
                      {artistNameMap.get(entry.id) ?? "Artist"}
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-amber-300">
                      {entry.points}pt
                    </span>
                    {weeklyWinTally.get(entry.id) ? (
                      <span className="shrink-0 text-[10px] text-emerald-400">
                        {weeklyWinTally.get(entry.id)}W
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11px] text-white/30">No activity yet — first win takes the lead.</p>
            )}
          </div>

          {/* Fan leaders */}
          <div className="border-t border-white/8 px-5 py-4 sm:border-l sm:border-t-0">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-rose-200/70">
              Fan Pick Leaders
            </p>
            {weeklyFanEntries.length > 0 ? (
              <ol className="space-y-2">
                {weeklyFanEntries.map((entry, i) => (
                  <li key={entry.id} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center text-[10px] font-black text-white/25">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white/80">
                      {fanNameMap.get(entry.id) ?? "Fan"}
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-rose-300">
                      {entry.points}pt
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[11px] text-white/30">No correct picks yet this week. Make your prediction on any live battle.</p>
            )}
          </div>
        </div>

        <div className="border-t border-white/8 px-5 py-3">
          <p className="text-[10px] text-white/30">
            Weekly standings reset every Sunday midnight UTC. Points carry into season record.
          </p>
        </div>
      </section>

      <div className="mb-8 rounded-3xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.1] via-black/20 to-cyan-500/[0.08] px-6 py-8">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200/90">
          Season Circuit
        </p>
        <h1 className="mt-1 text-4xl font-extrabold text-white">{seasonLabel}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/65">
          Division races feed the playoff bracket. Seedings update from real battle records in near real-time.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/versus" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:bg-white/10">
            Back to Battles
          </Link>
          <Link href="/timeline?focus=debate" className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-200 hover:bg-amber-500/20">
            Debate Results
          </Link>
        </div>
      </div>

      {quarterFinals.length > 0 && (
        <section className="mb-10 rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-lg font-black uppercase tracking-[0.2em] text-white/85">Playoff Bracket Preview</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {quarterFinals.map(([a, b], idx) => (
              <div key={`qf-${idx}`} className="rounded-xl border border-white/12 bg-black/25 p-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-white/45">Quarterfinal {idx + 1}</p>
                {[a, b].map((s, sideIdx) => (
                  <Link
                    key={`${s.id}-${sideIdx}`}
                    href={s.username ? `/studio/${s.username}` : "/leaderboard?type=artists"}
                    className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 transition hover:bg-white/[0.06]"
                  >
                    <span className="w-6 text-center text-xs font-black text-emerald-200">#{standings.findIndex((x) => x.id === s.id) + 1}</span>
                    <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                      {s.image ? (
                        <Image src={s.image} alt="" fill unoptimized className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs">🎤</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white/85">{s.name}</p>
                      <p className="text-[11px] text-white/45">{s.wins}W-{s.losses}L · {s.winRate}%</p>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {projectedQuarterFinals.length === 4 && (
        <section className="mb-10 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-4">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black uppercase tracking-[0.2em] text-cyan-200">Projected Bracket Path</h2>
              <p className="text-xs text-white/55">Simulation uses current record strength and win rate as weighted signals.</p>
            </div>
            {projectedFinal && (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200">
                Projected champ: {projectedFinal.winner.name}
              </span>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200/85">Quarterfinals</p>
              {projectedQuarterFinals.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/12 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/50">{m.label}</p>
                  <p className="mt-1 text-sm text-white/80">#{standings.findIndex((x) => x.id === m.a.id) + 1} {m.a.name} vs #{standings.findIndex((x) => x.id === m.b.id) + 1} {m.b.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">Projected winner: {m.winner.name}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200/85">Semifinals</p>
              {projectedSemiFinals.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/12 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/50">{m.label}</p>
                  <p className="mt-1 text-sm text-white/80">{m.a.name} vs {m.b.name}</p>
                  <p className="mt-1 text-xs text-cyan-200">Projected winner: {m.winner.name}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-cyan-200/85">Final</p>
              {projectedFinal ? (
                <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/55">{projectedFinal.label}</p>
                  <p className="mt-1 text-sm text-white/80">{projectedFinal.a.name} vs {projectedFinal.b.name}</p>
                  <p className="mt-1 text-sm font-bold text-cyan-100">Projected champion: {projectedFinal.winner.name}</p>
                  <p className="mt-1 text-[11px] text-white/60">Confidence edge: {Math.round(projectedFinal.edge)} pts</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/12 bg-black/25 p-3 text-xs text-white/55">
                  Add more completed battles to generate a final projection.
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {divisions.length > 0 && (
        <section className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <h2 className="mb-3 text-lg font-black uppercase tracking-[0.2em] text-white/85">Division Standings</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {divisions.map((div) => (
              <div key={div.division} className="rounded-xl border border-white/10 bg-black/25 p-3">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-200/85">{div.division} Division</p>
                <div className="space-y-1.5">
                  {div.rows.map((row, idx) => (
                    <Link
                      key={row.id}
                      href={row.username ? `/studio/${row.username}` : "/leaderboard?type=artists"}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 transition hover:bg-white/[0.06]"
                    >
                      <span className="w-6 text-center text-xs font-black text-white/55">{idx + 1}</span>
                      <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
                        {row.image ? (
                          <Image src={row.image} alt="" fill unoptimized className="object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs">🎤</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white/85">{row.name}</p>
                        <p className="text-[11px] text-white/45">{row.wins}W-{row.losses}L · {row.winRate}%</p>
                      </div>
                      {idx === 0 && (
                        <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
                          Leader
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4">
        <h2 className="mb-3 text-lg font-black uppercase tracking-[0.2em] text-amber-200">Season Rewards</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {rewardTiers.map((tier) => (
            <div key={tier.title} className="rounded-xl border border-white/12 bg-black/25 p-3">
              <p className="text-sm font-extrabold text-white">{tier.title}</p>
              <p className="mt-1 text-[11px] text-white/50">{tier.placement}</p>
              <ul className="mt-2 space-y-1">
                {tier.rewards.map((r) => (
                  <li key={r} className="text-xs text-white/70">• {r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
