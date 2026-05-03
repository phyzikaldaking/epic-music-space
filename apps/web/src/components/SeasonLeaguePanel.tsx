"use client";

import { useEffect, useMemo, useState } from "react";

type SeasonPanelProps = {
  season?: {
    name: string;
    startsAt: string | Date;
    endsAt: string | Date;
    status: "SCHEDULED" | "ACTIVE" | "ENDED" | "ARCHIVED";
  } | null;
  topLeague?: string | null;
  points?: number;
};

const leagueOrder = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "CROWN"];

const leagueStyles: Record<string, string> = {
  BRONZE: "border-orange-300/35 bg-orange-300/10 text-orange-100",
  SILVER: "border-zinc-200/35 bg-zinc-200/10 text-zinc-100",
  GOLD: "border-gold-200/45 bg-gold-200/12 text-gold-100",
  PLATINUM: "border-cyan-200/40 bg-cyan-200/12 text-cyan-100",
  DIAMOND: "border-blue-200/45 bg-blue-200/12 text-blue-100",
  CROWN: "border-gold-200/60 bg-gold-200/18 text-gold-50 shadow-gold-500/20",
};

function getTimeLeft(end: Date) {
  const diff = Math.max(0, end.getTime() - Date.now());
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { days, hours, minutes, seconds, diff };
}

function getLeagueFromPoints(points: number) {
  if (points >= 25_000) return "CROWN";
  if (points >= 15_000) return "DIAMOND";
  if (points >= 7_500) return "PLATINUM";
  if (points >= 3_000) return "GOLD";
  if (points >= 1_000) return "SILVER";
  return "BRONZE";
}

function getNextLeague(points: number) {
  const thresholds = [
    { league: "SILVER", points: 1_000 },
    { league: "GOLD", points: 3_000 },
    { league: "PLATINUM", points: 7_500 },
    { league: "DIAMOND", points: 15_000 },
    { league: "CROWN", points: 25_000 },
  ];
  return thresholds.find((item) => points < item.points) ?? null;
}

export default function SeasonLeaguePanel({ season, topLeague, points = 0 }: SeasonPanelProps) {
  const activeSeason = useMemo(() => {
    if (season) return season;
    const now = new Date();
    const endsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return { name: "Season 1", startsAt: now, endsAt, status: "ACTIVE" as const };
  }, [season]);

  const endsAt = useMemo(() => new Date(activeSeason.endsAt), [activeSeason.endsAt]);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(endsAt));
  const currentLeague = topLeague ?? getLeagueFromPoints(points);
  const nextLeague = getNextLeague(points);
  const progressToNext = nextLeague ? Math.max(5, Math.min(100, (points / nextLeague.points) * 100)) : 100;

  useEffect(() => {
    const interval = window.setInterval(() => setTimeLeft(getTimeLeft(endsAt)), 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  return (
    <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 text-white shadow-2xl shadow-black/45 backdrop-blur-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(253,224,71,0.18),transparent_35%),radial-gradient(circle_at_92%_20%,rgba(34,211,238,0.18),transparent_30%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.32em] text-gold-100/80">Ranked Season</p>
          <h2 className="mt-3 text-4xl font-black leading-[0.95] tracking-[-0.065em] text-white md:text-6xl">
            {activeSeason.name}: climb leagues before the reset.
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
            Every boost, crown win, placement, and license move can feed seasonal standings. Artists grind from Bronze to Crown while the timer keeps pressure on the floor.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {leagueOrder.map((league) => (
              <span key={league} className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${leagueStyles[league]} ${league === currentLeague ? "shadow-xl scale-105" : "opacity-55"}`}>
                {league}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[1.65rem] border border-white/10 bg-black/38 p-5 shadow-2xl shadow-black/35">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Current League</p>
              <h3 className="mt-1 text-3xl font-black tracking-[-0.055em] text-white">{currentLeague}</h3>
            </div>
            <div className={`grid h-16 w-16 place-items-center rounded-2xl border text-xs font-black uppercase tracking-[0.12em] ${leagueStyles[currentLeague] ?? leagueStyles.BRONZE}`}>
              {currentLeague.slice(0, 2)}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[
              ["Days", timeLeft.days],
              ["Hours", timeLeft.hours],
              ["Min", timeLeft.minutes],
              ["Sec", timeLeft.seconds],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                <p className="text-2xl font-black text-white">{String(value).padStart(2, "0")}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
              <span>{points.toLocaleString()} Season Points</span>
              <span>{nextLeague ? `${nextLeague.points.toLocaleString()} to ${nextLeague.league}` : "Max League"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-300 via-white to-cyan-300 transition-all" style={{ width: `${progressToNext}%` }} />
            </div>
            <p className="mt-3 text-xs font-semibold text-white/50">
              {nextLeague ? `${Math.max(0, nextLeague.points - points).toLocaleString()} points until ${nextLeague.league}.` : "Crown tier reached. Defend the throne."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
