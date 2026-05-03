"use client";

import { useEffect, useMemo, useState } from "react";

type CeremonyReward = {
  title: string;
  description: string;
  rewardType?: "CASH" | "BOOST_CREDITS" | "FREE_PLACEMENT" | "BADGE" | "FEATURED_SLOT" | string;
  value?: string | number | null;
};

type Ceremony = {
  status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
  headline: string;
  winnerArtist?: string | null;
  winnerSongTitle?: string | null;
  startsAt?: string | Date | null;
  completedAt?: string | Date | null;
  nextSeasonSlug?: string | null;
  nextSeasonName?: string | null;
  nextSeasonStartsAt?: string | Date | null;
  rewards?: CeremonyReward[];
};

type SeasonCeremonyOverlayProps = {
  ceremony?: Ceremony | null;
  autoPreview?: boolean;
};

function getTimeLeft(target?: string | Date | null) {
  if (!target) return null;
  const date = new Date(target);
  const diff = Math.max(0, date.getTime() - Date.now());
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    diff,
  };
}

function formatRewardValue(value?: string | number | null) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value.toLocaleString("en-US");
  return value;
}

const previewCeremony: Ceremony = {
  status: "LIVE",
  headline: "Season Champion Crowned",
  winnerArtist: "Crown Holder",
  winnerSongTitle: "Top Screen Control",
  nextSeasonName: "Next Ranked Season",
  nextSeasonStartsAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
  rewards: [
    { title: "Crown Badge", description: "Permanent champion recognition", rewardType: "BADGE" },
    { title: "Featured Slot", description: "Premium visibility in the next season", rewardType: "FEATURED_SLOT" },
    { title: "Boost Credits", description: "Power to defend the new season", rewardType: "BOOST_CREDITS", value: "2,500" },
  ],
};

export default function SeasonCeremonyOverlay({ ceremony, autoPreview = false }: SeasonCeremonyOverlayProps) {
  const activeCeremony = ceremony ?? (autoPreview ? previewCeremony : null);
  const [visible, setVisible] = useState(Boolean(activeCeremony && activeCeremony.status !== "CANCELLED"));
  const [phase, setPhase] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(activeCeremony?.nextSeasonStartsAt));

  const rewards = useMemo(() => activeCeremony?.rewards ?? [], [activeCeremony?.rewards]);

  useEffect(() => {
    if (!activeCeremony) return;
    const phaseInterval = window.setInterval(() => setPhase((value) => (value + 1) % 4), 2200);
    const timerInterval = window.setInterval(() => setTimeLeft(getTimeLeft(activeCeremony.nextSeasonStartsAt)), 1000);
    return () => {
      window.clearInterval(phaseInterval);
      window.clearInterval(timerInterval);
    };
  }, [activeCeremony]);

  if (!activeCeremony || !visible) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black/86 text-white backdrop-blur-md">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,rgba(253,224,71,0.30),transparent_30%),radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.20),transparent_28%),radial-gradient(circle_at_86%_72%,rgba(168,85,247,0.20),transparent_34%)]" />
      <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,rgba(255,255,255,.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:84px_84px]" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-gold-200 to-transparent shadow-[0_0_90px_rgba(253,224,71,0.95)]" />
      <div className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold-200/10 animate-pulse" />
      <div className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/10" />

      <button
        type="button"
        onClick={() => setVisible(false)}
        className="absolute right-5 top-5 z-20 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70 backdrop-blur transition hover:bg-white/12"
      >
        Close
      </button>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-6xl">
          <div className="mx-auto max-w-4xl text-center">
            <div className={`mx-auto mb-6 grid h-24 w-24 place-items-center rounded-full border border-gold-200/40 bg-gold-200/15 text-sm font-black uppercase tracking-[0.16em] text-gold-100 shadow-2xl shadow-gold-500/30 transition duration-700 ${phase === 0 ? "scale-110" : "scale-100"}`}>
              Crown
            </div>

            <p className="text-xs font-black uppercase tracking-[0.42em] text-gold-100/80">
              Season Reset Ceremony
            </p>
            <h1 className="mt-4 text-5xl font-black leading-[0.88] tracking-[-0.08em] text-white md:text-8xl">
              {activeCeremony.headline}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/60 md:text-lg">
              The season has closed. The crown is recorded, rewards are staged, and the next climb is preparing to open.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <section className="relative overflow-hidden rounded-[2rem] border border-gold-200/22 bg-black/48 p-6 shadow-2xl shadow-gold-500/10 backdrop-blur-2xl md:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(253,224,71,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.10),rgba(255,255,255,0.025))]" />
              <div className="relative">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-gold-100/75">Season Champion</p>
                <h2 className="mt-4 text-5xl font-black tracking-[-0.07em] text-white md:text-7xl">
                  {activeCeremony.winnerArtist ?? "Winner Pending"}
                </h2>
                <p className="mt-3 text-xl font-bold tracking-[-0.03em] text-cyan-100/85">
                  {activeCeremony.winnerSongTitle ?? "Winning track pending"}
                </p>
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Status</p>
                    <p className="mt-2 text-2xl font-black text-white">{activeCeremony.status}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Reward Slots</p>
                    <p className="mt-2 text-2xl font-black text-white">{rewards.length}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Next Season</p>
                    <p className="mt-2 text-2xl font-black text-white">Queued</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/45 backdrop-blur-2xl md:p-8">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-cyan-100/75">Reward Breakdown</p>
              <div className="mt-5 space-y-3">
                {rewards.length > 0 ? rewards.map((reward, index) => (
                  <div key={`${reward.title}-${index}`} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{reward.rewardType ?? "Reward"}</p>
                        <h3 className="mt-1 text-lg font-black tracking-[-0.035em] text-white">{reward.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-white/50">{reward.description}</p>
                      </div>
                      {formatRewardValue(reward.value) && (
                        <span className="rounded-full border border-gold-200/25 bg-gold-200/10 px-3 py-1 text-xs font-black text-gold-100">
                          {formatRewardValue(reward.value)}
                        </span>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-white/50">
                    Rewards are being calculated for this season.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="mt-5 rounded-[2rem] border border-white/10 bg-black/45 p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-white/38">Season Transition</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.055em] text-white">
                  {activeCeremony.nextSeasonName ?? "Next season launches soon"}
                </h2>
              </div>

              {timeLeft && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    ["Days", timeLeft.days],
                    ["Hours", timeLeft.hours],
                    ["Min", timeLeft.minutes],
                    ["Sec", timeLeft.seconds],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-20 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                      <p className="text-2xl font-black text-white">{String(value).padStart(2, "0")}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
                    </div>
                  ))}
                </div>
              )}

              <a
                href={activeCeremony.nextSeasonSlug ? `/leaderboard?season=${activeCeremony.nextSeasonSlug}` : "/marketplace"}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-gold-200"
              >
                Enter Next Season
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
