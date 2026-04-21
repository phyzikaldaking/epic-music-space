import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import { demoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Epic Music Space — License Cinematic Tracks",
  description:
    "The music city where independent artists sell limited licenses and creators find cinematic space, sci-fi, and game tracks with clear revenue-participation terms.",
  alternates: { canonical: "/" },
};

type SampleSong = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl?: string | null;
  bpm: number | null;
  key: string | null;
};

type HomeData = {
  songCount: number;
  licenseCount: number;
  totalRevenue: number;
  sampleSongs: SampleSong[];
};

const demoSampleSongs: SampleSong[] = demoTracks.map((t) => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  genre: t.genre,
  audioUrl: t.audioUrl,
  coverUrl: t.coverUrl,
  bpm: t.bpm,
  key: t.key,
}));

const emptyHomeData: HomeData = {
  songCount: 0,
  licenseCount: 0,
  totalRevenue: 0,
  sampleSongs: demoSampleSongs,
};

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    if (!process.env.DATABASE_URL) return emptyHomeData;
    try {
      const [songCount, licenseCount, transactionSum, sampleSongs] =
        await Promise.all([
          prisma.song.count({ where: { isActive: true } }),
          prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
          prisma.transaction.aggregate({
            where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
            _sum: { amount: true },
          }),
          prisma.song.findMany({
            where: { isActive: true, audioUrl: { not: "" } },
            orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
            take: 3,
            select: {
              id: true, title: true, artist: true, genre: true,
              audioUrl: true, coverUrl: true, bpm: true, key: true,
            },
          }),
        ]);
      return {
        songCount,
        licenseCount,
        totalRevenue: Number(transactionSum._sum.amount ?? 0),
        sampleSongs: sampleSongs.length > 0 ? sampleSongs : demoSampleSongs,
      };
    } catch {
      return emptyHomeData;
    }
  },
  ["homepage-v3"],
  { revalidate: 3600 },
);

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function HomePage() {
  const { songCount, licenseCount, totalRevenue, sampleSongs } =
    await getHomeData();

  const stats = [
    songCount > 0 && { value: fmt(songCount) + "+", label: "Active Tracks" },
    licenseCount > 0 && { value: fmt(licenseCount) + "+", label: "Licenses Sold" },
    totalRevenue > 0 && { value: fmtRevenue(totalRevenue), label: "Paid to Artists" },
    { value: "3", label: "Districts" },
    { value: "∞", label: "Possibilities" },
  ].filter(Boolean) as { value: string; label: string }[];

  const displayStats = stats.slice(0, 4);
  const featured = sampleSongs[0];

  return (
    <div className="flex flex-col">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100svh-65px)] w-full overflow-hidden bg-[#050508]">
        {/* Ambient orbs */}
        <div className="pointer-events-none absolute -top-40 left-1/4 h-[700px] w-[700px] rounded-full bg-brand-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 right-1/4 h-[600px] w-[600px] rounded-full bg-accent-500/14 blur-[100px]" />
        <div className="pointer-events-none absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-gold-500/8 blur-[90px]" />

        {/* Grid overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:60px_60px]" />

        {/* Scan sweep */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(108,92,231,0.04)_50%,transparent_100%)] animate-[scanline_8s_ease-in-out_infinite]" />

        <div className="relative mx-auto grid min-h-[calc(100svh-65px)] max-w-7xl items-center gap-16 px-4 py-20 md:grid-cols-[1fr_1fr] md:py-0">

          {/* Left — Copy */}
          <div className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
              The Music City is Live
            </div>

            <h1 className="text-[clamp(2.8rem,6vw,5.5rem)] font-black leading-[1.0] tracking-tight">
              Where music
              <br />
              <span className="text-gradient-ems">becomes legacy.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-white/55">
              License cinematic space tracks with one click. Artists set the price,
              cap the supply, and share revenue. Creators get clear rights, fast.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/marketplace"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-7 text-sm font-bold text-white shadow-[0_0_32px_rgba(108,92,231,0.5)] transition hover:bg-brand-400 hover:shadow-[0_0_48px_rgba(108,92,231,0.65)] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Browse Tracks
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </Link>
              <Link
                href="/city"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/15 px-7 text-sm font-bold text-white/70 backdrop-blur transition hover:border-accent-400/50 hover:text-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                🏙️ Explore the City
              </Link>
            </div>

            {/* Stats row */}
            <dl className="mt-12 grid grid-cols-4 gap-4 border-t border-white/8 pt-8">
              {displayStats.map((s) => (
                <div key={s.label}>
                  <dd className="text-2xl font-black tracking-tight text-gradient-ems">{s.value}</dd>
                  <dt className="mt-1 text-xs text-white/38">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* Right — Featured player */}
          <div className="animate-fade-up" style={{ animationDelay: "100ms" }}>
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute -inset-4 rounded-3xl bg-brand-500/15 blur-2xl" />

              <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                      Featured Track
                    </p>
                    <p className="mt-1 text-lg font-extrabold">
                      {featured ? featured.title : "Catalog Loading"}
                    </p>
                    {featured && (
                      <p className="text-sm text-white/45">{featured.artist}</p>
                    )}
                  </div>
                  {featured && (
                    <div className="flex flex-wrap gap-1.5 text-right">
                      {featured.genre && (
                        <span className="rounded-full bg-brand-500/20 px-2.5 py-0.5 text-[10px] font-bold text-brand-300">
                          {featured.genre}
                        </span>
                      )}
                      {featured.bpm && (
                        <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] text-white/50">
                          {featured.bpm} BPM
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {featured ? (
                  <AudioPlayer audioUrl={featured.audioUrl} title={featured.title} />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-xl bg-white/4 text-sm text-white/30">
                    First tracks coming soon
                  </div>
                )}

                {/* Mini waveform decoration */}
                <div className="mt-5 flex items-end gap-0.5 opacity-30">
                  {[18,28,44,36,60,52,40,68,56,44,32,50,64,48,36,52,44,28,40,56,48,36,24,44].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-500 to-accent-400"
                      style={{ height: `${h}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Quick links below player */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {sampleSongs.slice(1, 3).map((song) => (
                <Link
                  key={song.id}
                  href={`/track/${song.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 transition hover:border-brand-500/40 hover:bg-brand-500/8"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/20 text-base">
                    🎵
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold">{song.title}</p>
                    <p className="truncate text-xs text-white/38">{song.artist}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE TICKER ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-y border-white/6 bg-[#0a0a0e] py-3">
        <div className="animate-[marquee_30s_linear_infinite] flex gap-12 whitespace-nowrap">
          {[
            "🎵 License Music Instantly",
            "⚔️ Live Song Battles",
            "🏙️ 3D Music City",
            "🥇 EMS Leaderboard",
            "🎚️ AI-Scored Tracks",
            "💎 Limited License Drops",
            "🔮 Indie Blocks District",
            "👑 Label Row District",
            "🏙️ Downtown Prime District",
            "🚀 Artist Studio Tools",
          ].concat([
            "🎵 License Music Instantly",
            "⚔️ Live Song Battles",
            "🏙️ 3D Music City",
            "🥇 EMS Leaderboard",
            "🎚️ AI-Scored Tracks",
            "💎 Limited License Drops",
          ]).map((item, i) => (
            <span key={i} className="text-xs font-semibold tracking-widest text-white/30 uppercase">
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── DISTRICTS ────────────────────────────────────────────────── */}
      <section className="w-full bg-[#07090d] px-4 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-accent-400">
              The City Districts
            </p>
            <h2 className="text-4xl font-black md:text-5xl">
              Every track earns its{" "}
              <span className="text-gradient-ems">district.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/45">
              Songs are ranked by AI score into three districts. Higher districts
              get more exposure. Every play, license, and battle win counts.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {/* Label Row */}
            <Link
              href="/city"
              className="group relative overflow-hidden rounded-2xl border border-gold-500/25 bg-gradient-to-b from-gold-500/10 to-transparent p-6 transition hover:border-gold-400/50 hover:shadow-[0_0_40px_rgba(255,215,0,0.15)]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-gold-500/10 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-3xl">👑</span>
                  <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-gold-400">
                    Elite
                  </span>
                </div>
                <h3 className="text-xl font-black text-gold-300">Label Row</h3>
                <p className="mt-2 text-sm text-white/45 leading-6">
                  The penthouse of EMS. Highest AI-scored tracks, maximum
                  discovery boost, and premium label placement.
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs font-bold text-gold-400">
                  <span>5× visibility</span>
                  <span className="h-px flex-1 bg-gold-500/20" />
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>

            {/* Downtown Prime */}
            <Link
              href="/city"
              className="group relative overflow-hidden rounded-2xl border border-brand-500/30 bg-gradient-to-b from-brand-500/12 to-transparent p-6 transition hover:border-brand-400/60 hover:shadow-[0_0_40px_rgba(108,92,231,0.2)]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/15 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-3xl">🏙️</span>
                  <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-brand-300">
                    Prime
                  </span>
                </div>
                <h3 className="text-xl font-black text-brand-300">Downtown Prime</h3>
                <p className="mt-2 text-sm text-white/45 leading-6">
                  The heartbeat of the city. Strong scores, active artists,
                  and a stage for emerging breakout tracks.
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs font-bold text-brand-400">
                  <span>3× visibility</span>
                  <span className="h-px flex-1 bg-brand-500/20" />
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>

            {/* Indie Blocks */}
            <Link
              href="/city"
              className="group relative overflow-hidden rounded-2xl border border-accent-500/20 bg-gradient-to-b from-accent-500/8 to-transparent p-6 transition hover:border-accent-400/50 hover:shadow-[0_0_40px_rgba(0,245,255,0.12)]"
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent-500/8 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-3xl">🔮</span>
                  <span className="rounded-full border border-accent-500/25 bg-accent-500/8 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-300">
                    Open
                  </span>
                </div>
                <h3 className="text-xl font-black text-accent-200">Indie Blocks</h3>
                <p className="mt-2 text-sm text-white/45 leading-6">
                  Where every track starts. All artists land here first and
                  climb by earning plays, battles, and licenses.
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs font-bold text-accent-400">
                  <span>1× visibility</span>
                  <span className="h-px flex-1 bg-accent-500/15" />
                  <span className="transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── LIVE TRACKS ──────────────────────────────────────────────── */}
      <section className="w-full border-t border-white/6 bg-[#050508] px-4 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-brand-400">
                Preview Now
              </p>
              <h2 className="text-3xl font-black md:text-4xl">
                Hear before you license.
              </h2>
            </div>
            <Link
              href="/marketplace"
              className="hidden rounded-xl border border-white/12 px-5 py-2.5 text-sm font-bold text-white/55 transition hover:border-brand-400/40 hover:text-white md:inline-flex"
            >
              Full catalog →
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {sampleSongs.map((song, i) => (
              <article
                key={song.id}
                className="group relative overflow-hidden rounded-2xl border border-white/8 bg-[#0e0e14] p-5 transition hover:border-brand-500/30 hover:shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
              >
                {/* Track number badge */}
                <div className="mb-4 flex items-start justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-xs font-black text-brand-400">
                    {i + 1}
                  </span>
                  <Link
                    href={`/track/${song.id}`}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-white/45 transition hover:border-brand-400/40 hover:text-white"
                  >
                    License
                  </Link>
                </div>

                <div className="mb-4">
                  <h3 className="font-extrabold text-white">{song.title}</h3>
                  <p className="text-sm text-white/40">{song.artist}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {song.genre && (
                      <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] font-semibold text-white/50">
                        {song.genre}
                      </span>
                    )}
                    {song.bpm && (
                      <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-white/40">
                        {song.bpm} BPM
                      </span>
                    )}
                    {song.key && (
                      <span className="rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-white/40">
                        {song.key}
                      </span>
                    )}
                  </div>
                </div>

                <AudioPlayer audioUrl={song.audioUrl} title={song.title} />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORM FEATURES ────────────────────────────────────────── */}
      <section className="w-full border-t border-white/6 bg-[#07090d] px-4 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-gold-400">
              Built Different
            </p>
            <h2 className="text-4xl font-black md:text-5xl">
              A platform with{" "}
              <span className="text-gradient-gold">no weak links.</span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "⚔️",
                title: "Live Song Battles",
                body: "Tracks compete head-to-head in timed versus matches. Every vote boosts the winner's discovery score.",
                href: "/versus",
                color: "brand",
              },
              {
                icon: "🤖",
                title: "AI-Powered Scoring",
                body: "GPT-4o analyzes sentiment, lyrics, and production quality. The EMS Score is your song's rank in the city.",
                href: "/leaderboard",
                color: "accent",
              },
              {
                icon: "💎",
                title: "Limited License Drops",
                body: "Artists cap how many licenses exist. Scarcity drives value. Buyers get early-supporter terms.",
                href: "/marketplace",
                color: "gold",
              },
              {
                icon: "🏙️",
                title: "3D Music Metaverse",
                body: "Walk a Babylon.js city where studio buildings grow taller with score. Your art lives in the skyline.",
                href: "/city",
                color: "brand",
              },
              {
                icon: "📡",
                title: "Live Activity Feed",
                body: "Real-time Supabase stream shows every license, vote, and upload as it happens across the platform.",
                href: "/marketplace",
                color: "accent",
              },
              {
                icon: "🚀",
                title: "Billboard Advertising",
                body: "Brands and labels buy rooftop billboards, street banners, and district naming rights inside the city.",
                href: "/pricing",
                color: "gold",
              },
            ].map((feat) => (
              <Link
                key={feat.title}
                href={feat.href}
                className={`group relative overflow-hidden rounded-2xl border bg-white/[0.02] p-6 transition hover:-translate-y-1 hover:shadow-2xl ${
                  feat.color === "brand"
                    ? "border-brand-500/20 hover:border-brand-400/40 hover:shadow-brand-500/10"
                    : feat.color === "accent"
                    ? "border-accent-500/15 hover:border-accent-400/35 hover:shadow-accent-500/10"
                    : "border-gold-500/20 hover:border-gold-400/40 hover:shadow-gold-500/10"
                }`}
              >
                <div className="mb-4 text-3xl">{feat.icon}</div>
                <h3 className="mb-2 font-extrabold">{feat.title}</h3>
                <p className="text-sm leading-6 text-white/45">{feat.body}</p>
                <div
                  className={`mt-4 text-xs font-bold transition group-hover:translate-x-1 ${
                    feat.color === "brand"
                      ? "text-brand-400"
                      : feat.color === "accent"
                      ? "text-accent-400"
                      : "text-gold-400"
                  }`}
                >
                  Explore →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOR ARTISTS / FOR CREATORS ───────────────────────────────── */}
      <section className="w-full border-t border-white/6 bg-[#050508] px-4 py-24">
        <div className="mx-auto max-w-7xl grid gap-5 md:grid-cols-2">

          {/* Artists */}
          <div className="relative overflow-hidden rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/15 blur-3xl" />
            <div className="relative">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-brand-400">For Artists</p>
              <h3 className="text-2xl font-black">Your music. Your rules. Your revenue.</h3>
              <p className="mt-3 text-sm leading-7 text-white/50">
                Upload a track, set the price, cap the license count, and let AI score it.
                Every sale sends royalties straight to your wallet. Your studio grows in the city skyline.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  "Set your own license price and cap",
                  "90% revenue share on every sale",
                  "AI scoring + district ranking",
                  "Enter song battles to boost visibility",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/studio/new"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-6 text-sm font-bold text-white shadow-[0_0_24px_rgba(108,92,231,0.4)] transition hover:bg-brand-400"
              >
                Start Your Studio →
              </Link>
            </div>
          </div>

          {/* Creators */}
          <div className="relative overflow-hidden rounded-2xl border border-accent-500/20 bg-gradient-to-br from-accent-500/8 via-transparent to-transparent p-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent-500/10 blur-3xl" />
            <div className="relative">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-accent-400">For Creators</p>
              <h3 className="text-2xl font-black">Rights-clear music. Zero guesswork.</h3>
              <p className="mt-3 text-sm leading-7 text-white/50">
                Preview any track before buying. See the exact license count, price, and
                revenue-share terms on every listing. License in seconds — no emails, no lawyers.
              </p>
              <ul className="mt-5 space-y-2">
                {[
                  "Hear the full track before you commit",
                  "Clear license terms on every listing",
                  "Filter by genre, BPM, mood, and key",
                  "Dashboard tracks every license you own",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/marketplace"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl border border-accent-400/40 bg-accent-500/10 px-6 text-sm font-bold text-accent-300 transition hover:bg-accent-500/20"
              >
                Browse the Catalog →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-[#07090d] px-4 py-32 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(108,92,231,0.25),transparent_60%)]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-[100px]" />

        <div className="relative mx-auto max-w-3xl">
          <p className="mb-4 text-xs font-black uppercase tracking-[0.25em] text-accent-400">
            Join the City
          </p>
          <h2 className="text-5xl font-black leading-tight md:text-6xl">
            Your sound
            <br />
            <span className="text-gradient-ems">deserves a skyline.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-white/45">
            Whether you&apos;re dropping your first track or licensing your hundredth cue —
            EMS is the city where music careers are built.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/signup"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand-500 px-10 text-base font-black text-white shadow-[0_0_48px_rgba(108,92,231,0.55)] transition hover:bg-brand-400 hover:shadow-[0_0_64px_rgba(108,92,231,0.7)]"
            >
              Get Started Free
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-white/12 px-10 text-base font-bold text-white/65 transition hover:border-white/25 hover:text-white"
            >
              Browse Tracks
            </Link>
          </div>

          <p className="mt-6 text-xs text-white/25">
            No subscription required to browse · Artists keep 90% of every sale
          </p>
        </div>
      </section>
    </div>
  );
}
