import Link from "next/link";
import { prisma } from "@/lib/prisma";
import nextDynamic from "next/dynamic";
import type { CityBuilding } from "@/app/api/city/data/route";

export const dynamic = "force-dynamic";

// Lazy-load BabylonJS — must stay client-only
const CityScene3D = nextDynamic(
  () => import("@/components/CityScene3D"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#07070f]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
          <p className="text-sm text-brand-400 tracking-widest uppercase animate-pulse">
            Entering the Metaverse…
          </p>
        </div>
      </div>
    ),
  }
);

export default async function HomePage() {
  // ── Fetch city + stat data in parallel ──────────────────────────────────
  const [songCount, licenseCount, transactionSum, studiosByDistrict] =
    await Promise.all([
      prisma.song.count({ where: { isActive: true } }),
      prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
      prisma.transaction.aggregate({
        where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
        _sum: { amount: true },
      }),
      prisma.studio.findMany({
        orderBy: { user: { songs: { _count: "desc" } } },
        take: 48,
        select: {
          username: true,
          district: true,
          level: true,
          user: {
            select: {
              name: true,
              image: true,
              songs: {
                where: { isActive: true },
                select: { aiScore: true, soldLicenses: true },
              },
            },
          },
        },
      }),
    ]);

  const totalRevenue = Number(transactionSum._sum.amount ?? 0);

  function fmtCount(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M+`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K+`;
    return String(n);
  }
  function fmtRevenue(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }

  const STATS = [
    { v: fmtCount(songCount), l: "Songs licensed" },
    { v: fmtRevenue(totalRevenue), l: "Paid to artists" },
    { v: fmtCount(licenseCount), l: "License holders" },
  ];

  type StudioForCity = {
    username: string;
    district: string;
    level: number;
    user: {
      name: string | null;
      image: string | null;
      songs: { aiScore: number; soldLicenses: number }[];
    };
  };

  const cityBuildings: CityBuilding[] = (
    studiosByDistrict as StudioForCity[]
  ).map((s) => {
    const songs = s.user.songs;
    const avgScore =
      songs.length > 0
        ? songs.reduce((acc, x) => acc + x.aiScore, 0) / songs.length
        : 0;
    const totalSold = songs.reduce((acc, x) => acc + x.soldLicenses, 0);
    return {
      username: s.username,
      name: s.user.name ?? s.username,
      image: s.user.image,
      district: s.district as CityBuilding["district"],
      level: s.level,
      avgScore: Math.round(avgScore * 10) / 10,
      songCount: songs.length,
      totalSold,
    };
  });

  return (
    <div className="flex flex-col">

      {/* ── FULL-VIEWPORT 3-D METAVERSE CITY HERO ──────────────────────────── */}
      <section
        className="relative w-full scanlines"
        style={{ height: "calc(100vh - 57px)" }}   /* full screen minus navbar */
      >
        {/* 3-D scene fills the entire hero */}
        <div className="absolute inset-0">
          <CityScene3D buildings={cityBuildings} />
        </div>

        {/* Subtle vignette so overlaid text pops */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-70" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/60 via-transparent to-transparent" />

        {/* ── HUD overlay — top-centre headline ── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center pt-8 px-4 text-center">
          {/* Live badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/50 bg-[#0a0a0a]/70 backdrop-blur-sm px-5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
            </span>
            <span className="text-xs font-semibold text-brand-400 tracking-widest uppercase">
              Music Metaverse · Live
            </span>
          </div>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight drop-shadow-lg md:text-6xl">
            Welcome to the <span className="text-gradient-ems">City</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/60 drop-shadow">
            Explore the 3-D metaverse. Drag &amp; zoom the city. Click any
            building to open its studio.
          </p>
        </div>

        {/* ── HUD overlay — bottom CTAs ── */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-10 px-4">
          {/* Stats bar */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-white/60 mb-2">
            {STATS.map((s) => (
              <div key={s.l} className="text-center">
                <p className="text-xl font-extrabold text-gradient-ems">{s.v}</p>
                <p className="text-xs mt-0.5 text-white/40">{s.l}</p>
              </div>
            ))}
          </div>

          {/* Role CTAs */}
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/auth/signup?role=ARTIST"
              className="flex items-center gap-2 rounded-2xl border border-brand-500/60 bg-[#0a0a0a]/80 backdrop-blur-sm px-6 py-3 text-sm font-bold tracking-wide transition hover:border-brand-400 hover:bg-brand-500/20 glow-purple-sm"
            >
              <span className="text-xl">🎤</span>
              <span>
                <span className="block text-brand-400 text-[10px] uppercase tracking-widest mb-0.5">Creator</span>
                I&apos;m an Artist
              </span>
            </Link>
            <Link
              href="/auth/signup?role=LISTENER"
              className="flex items-center gap-2 rounded-2xl border border-white/20 bg-[#0a0a0a]/80 backdrop-blur-sm px-6 py-3 text-sm font-bold tracking-wide transition hover:border-accent-500/50 hover:bg-accent-500/10"
            >
              <span className="text-xl">🎧</span>
              <span>
                <span className="block text-accent-400 text-[10px] uppercase tracking-widest mb-0.5">Fan</span>
                I&apos;m a Listener
              </span>
            </Link>
            <Link
              href="/auth/signup?role=LABEL"
              className="flex items-center gap-2 rounded-2xl border border-gold-500/50 bg-[#0a0a0a]/80 backdrop-blur-sm px-6 py-3 text-sm font-bold tracking-wide transition hover:border-gold-400 hover:bg-gold-500/15"
            >
              <span className="text-xl">📢</span>
              <span>
                <span className="block text-gold-400 text-[10px] uppercase tracking-widest mb-0.5">Partner</span>
                I&apos;m a Brand
              </span>
            </Link>
            <Link
              href="/city"
              className="flex items-center gap-2 rounded-2xl border border-white/15 bg-[#0a0a0a]/80 backdrop-blur-sm px-6 py-3 text-sm font-bold tracking-wide transition hover:bg-white/8"
            >
              <span className="text-xl">🏙️</span>
              <span>
                <span className="block text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Explore</span>
                Full City Map
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="w-full border-t border-white/8 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-extrabold">
            The EMS economy
          </h2>
          <p className="mb-14 text-center text-white/45">
            Three flows. One city. Real money.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: "🎤",
                title: "Artists upload",
                color: "border-brand-500/30 bg-brand-500/8",
                accent: "text-brand-400",
                desc: "Upload tracks, set the number of licenses available and a revenue-share percentage. Earn every time your song streams.",
              },
              {
                icon: "🎟️",
                title: "Fans license",
                color: "border-accent-500/30 bg-accent-500/8",
                accent: "text-accent-400",
                desc: "Buy digital licenses — each entitles you to a defined share of that song's streaming revenue, paid out quarterly.",
              },
              {
                icon: "💸",
                title: "Everyone earns",
                color: "border-gold-500/30 bg-gold-500/8",
                accent: "text-gold-400",
                desc: "As the song streams, EMS distributes revenue automatically. Artists keep their share; license holders receive theirs.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className={`rounded-2xl border p-6 ${item.color} card-hover-neon`}
              >
                <div className="mb-4 text-4xl">{item.icon}</div>
                <h3 className={`mb-2 text-lg font-bold ${item.accent}`}>{item.title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DISTRICTS ──────────────────────────────────────────────────────── */}
      <section className="w-full border-t border-white/8 bg-[#0d0d0d] px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-3xl font-extrabold">
            Navigate the <span className="text-gradient-ems">City</span>
          </h2>
          <p className="mb-14 text-center text-white/45">
            Songs are ranked into districts. The higher you climb, the more
            exposure you get.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "👑",
                name: "Label Row",
                desc: "Elite label-backed artists. Highest visibility.",
                border: "border-gold-500/40",
                bg: "bg-gold-500/6",
                text: "text-gold-400",
              },
              {
                icon: "🏙️",
                name: "Downtown Prime",
                desc: "High-performers unlocked by AI score.",
                border: "border-brand-500/40",
                bg: "bg-brand-500/8",
                text: "text-brand-400",
              },
              {
                icon: "🔮",
                name: "Indie Blocks",
                desc: "The starting grid — your launchpad.",
                border: "border-accent-500/30",
                bg: "bg-accent-500/6",
                text: "text-accent-400",
              },
            ].map((d) => (
              <div
                key={d.name}
                className={`rounded-2xl border ${d.border} ${d.bg} p-6 text-center card-hover-neon`}
              >
                <div className="mb-3 text-4xl">{d.icon}</div>
                <p className={`mb-1 font-bold ${d.text}`}>{d.name}</p>
                <p className="text-xs text-white/50">{d.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/city"
              className="inline-block rounded-xl border border-white/15 px-8 py-3 text-sm font-semibold hover:bg-white/8 transition"
            >
              View the City map →
            </Link>
          </div>
        </div>
      </section>

      {/* ── LEGAL NOTICE ───────────────────────────────────────────────────── */}
      <section className="w-full border-t border-white/8 px-4 py-10 text-center text-xs text-white/25">
        <p className="mx-auto max-w-3xl">
          Epic Music Space licenses are{" "}
          <strong className="text-white/40">digital content licenses</strong>,
          not securities or financial instruments. They do not represent equity,
          debt, or investment contracts of any kind. Revenue participation is
          contractual and limited to streaming royalties as defined in your{" "}
          <Link href="/legal/licensing" className="underline hover:text-white/50">
            Licensing Agreement
          </Link>
          . Past performance does not guarantee future earnings. Please review
          our{" "}
          <Link href="/legal/terms" className="underline hover:text-white/50">
            Terms of Service
          </Link>{" "}
          before purchasing.
        </p>
      </section>
    </div>
  );
}
