import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import HeroCityCanvas from "@/components/HeroCityCanvas";
import { demoTracks } from "@/lib/demoTracks";
import { prisma } from "@/lib/prisma";
import type { CityBuilding } from "@/app/api/city/data/route";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Epic Music Space - License Cinematic Tracks",
  description:
    "Preview, license, and release cinematic space, sci-fi, and game music with clear terms, capped license drops, and revenue participation.",
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
  licensePrice: string;
  revenueSharePct: string;
  totalLicenses: number;
  soldLicenses: number;
  aiScore: number;
  description?: string | null;
};

type HomeData = {
  songCount: number;
  licenseCount: number;
  totalRevenue: number;
  sampleSongs: SampleSong[];
};

type IconProps = {
  className?: string;
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
  licensePrice: t.licensePrice,
  revenueSharePct: t.revenueSharePct,
  totalLicenses: t.totalLicenses,
  soldLicenses: t.soldLicenses,
  aiScore: t.aiScore,
  description: t.description,
}));

const emptyHomeData: HomeData = {
  songCount: 0,
  licenseCount: 0,
  totalRevenue: 0,
  sampleSongs: demoSampleSongs,
};

const waveBars = [
  36, 58, 42, 74, 55, 88, 48, 69, 93, 64, 52, 81, 44, 70, 50, 62,
];

const districtRows = [
  {
    name: "Label Row",
    score: "90+ EMS score",
    lift: "Premium placement",
    body: "Top-scoring releases get the strongest discovery slots and label-facing visibility.",
  },
  {
    name: "Downtown Prime",
    score: "70-89 EMS score",
    lift: "Catalog momentum",
    body: "Active tracks with strong plays, battles, and license activity move through the main district.",
  },
  {
    name: "Indie Blocks",
    score: "Open entry",
    lift: "Launch surface",
    body: "New artists start here with the same licensing tools and a clear path upward.",
  },
];

const platformLinks = [
  {
    title: "Marketplace",
    href: "/marketplace",
    body: "Browse tracks by genre, BPM, key, score, price, and remaining license supply.",
  },
  {
    title: "Versus Battles",
    href: "/versus",
    body: "Put tracks head-to-head and let votes push winners up the discovery ladder.",
  },
  {
    title: "Music City",
    href: "/city",
    body: "See studios, district status, and release momentum in the 3D city view.",
  },
];

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    if (!hasUsableDatabaseUrl()) return emptyHomeData;
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
              id: true,
              title: true,
              artist: true,
              genre: true,
              description: true,
              audioUrl: true,
              coverUrl: true,
              bpm: true,
              key: true,
              licensePrice: true,
              revenueSharePct: true,
              totalLicenses: true,
              soldLicenses: true,
              aiScore: true,
            },
          }),
        ]);

      return {
        songCount,
        licenseCount,
        totalRevenue: Number(transactionSum._sum.amount ?? 0),
        sampleSongs:
          sampleSongs.length > 0
            ? sampleSongs.map((song) => ({
                ...song,
                licensePrice: song.licensePrice.toString(),
                revenueSharePct: song.revenueSharePct.toString(),
              }))
            : demoSampleSongs,
      };
    } catch {
      return emptyHomeData;
    }
  },
  ["homepage-v4"],
  { revalidate: 3600 },
);

function hasUsableDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;

  return ![
    "USER:PASSWORD@HOST",
    "PROJECT_REF:PASSWORD",
    "your-database",
    "your_db",
  ].some((placeholder) => databaseUrl.includes(placeholder));
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRevenue(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function formatPrice(value: string) {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function coverStyle(url?: string | null): CSSProperties {
  if (!url) {
    return {
      background:
        "linear-gradient(135deg, rgba(108,92,231,.38), rgba(0,245,255,.16) 45%, rgba(255,215,0,.18))",
    };
  }

  return {
    backgroundImage: [
      "linear-gradient(180deg, rgba(5,5,9,0) 45%, rgba(5,5,9,.68) 100%)",
      `url(${JSON.stringify(url)})`,
    ].join(", "),
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function remainingLicenses(song: SampleSong) {
  return Math.max(song.totalLicenses - song.soldLicenses, 0);
}

function ArrowRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.25}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 6l6 6-6 6M5 12h14"
      />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.25}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function WaveIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 13c1.6 0 1.6-6 3.2-6s1.6 10 3.2 10 1.6-13 3.2-13 1.6 16 3.2 16S18.4 9 20 9"
      />
    </svg>
  );
}

function ShieldIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7 3v5c0 4.9-2.9 8.4-7 10-4.1-1.6-7-5.1-7-10V6l7-3z"
      />
    </svg>
  );
}

function CityIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 21V9l5-3v15M9 21V4l6 3v14M15 21v-9l5-2v11M3 21h18"
      />
    </svg>
  );
}

export default async function HomePage() {
  const { songCount, licenseCount, totalRevenue, sampleSongs } =
    await getHomeData();

  // Fetch trimmed building set for hero 3D canvas (top 9 studios)
  let heroBuildings: CityBuilding[] = [];
  try {
    const studios = await prisma.studio.findMany({
      orderBy: { level: "desc" },
      take: 9,
      select: {
        username: true,
        district: true,
        level: true,
        user: {
          select: {
            name: true,
            songs: { where: { isActive: true }, select: { aiScore: true } },
          },
        },
      },
    });
    heroBuildings = studios.map((s) => {
      const avgScore =
        s.user.songs.length > 0
          ? s.user.songs.reduce((acc, x) => acc + x.aiScore, 0) /
            s.user.songs.length
          : 0;
      return {
        username: s.username,
        name: s.user.name ?? s.username,
        image: null,
        district: s.district as CityBuilding["district"],
        level: s.level,
        avgScore: Math.round(avgScore * 10) / 10,
        songCount: s.user.songs.length,
        totalSold: 0,
      };
    });
  } catch {
    // Database may be unavailable; hero canvas will show empty gracefully
  }

  const featured = sampleSongs[0];
  const displayStats = [
    {
      value: songCount > 0 ? `${formatCount(songCount)}+` : "Curated",
      label: "Active tracks",
    },
    {
      value: licenseCount > 0 ? `${formatCount(licenseCount)}+` : "Capped",
      label: "License supply",
    },
    {
      value: totalRevenue > 0 ? formatRevenue(totalRevenue) : "90%",
      label: totalRevenue > 0 ? "Paid to artists" : "Artist share",
    },
    { value: "3", label: "Discovery districts" },
  ];

  const creatorChecks = [
    "Preview before checkout",
    "Clear license terms",
    "Limited license counts",
    "Instant catalog search",
  ];

  const artistChecks = [
    "Set price and supply",
    "Keep 90% of sales",
    "Earn district placement",
    "Boost through battles",
  ];

  return (
    <div className="flex flex-col bg-[#050509] text-white">
      <section className="relative isolate min-h-[calc(100svh-65px)] w-full overflow-hidden border-b border-white/8">
        <HeroCityCanvas buildings={heroBuildings} />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#050509_0%,rgba(5,5,9,.94)_34%,rgba(5,5,9,.58)_67%,rgba(5,5,9,.86)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-[linear-gradient(0deg,#050509_0%,rgba(5,5,9,0)_100%)]" />

        <div className="mx-auto grid min-h-[calc(100svh-65px)] max-w-7xl items-center gap-12 px-4 py-14 md:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.72fr)] md:py-8">
          <div className="max-w-3xl animate-fade-up">
            <p className="mb-5 inline-flex items-center gap-2 border-l-2 border-accent-400 pl-3 text-xs font-bold uppercase tracking-[0.22em] text-accent-300">
              <WaveIcon className="h-4 w-4" />
              Cinematic licensing marketplace
            </p>

            <h1 className="text-balance text-[clamp(3.25rem,8vw,7.25rem)] font-black leading-[0.88] tracking-tight">
              Epic Music Space
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-white/64 md:text-xl">
              Preview independent space, sci-fi, and game cues. Buy clear
              digital music licenses from capped drops, or release your own
              catalog into a discovery city built for artists.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/marketplace"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-white px-6 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Browse tracks
                <ArrowRightIcon />
              </Link>
              <Link
                href="/studio/new"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-white/18 px-6 text-sm font-bold text-white/76 transition hover:border-white/34 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Release music
              </Link>
            </div>

            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-7 sm:grid-cols-4">
              {displayStats.map((stat) => (
                <div key={stat.label}>
                  <dd className="text-2xl font-black tracking-tight text-white">
                    {stat.value}
                  </dd>
                  <dt className="mt-1 text-xs uppercase tracking-[0.16em] text-white/38">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          {featured && (
            <div
              className="animate-fade-up md:justify-self-end"
              style={{ animationDelay: "120ms" }}
            >
              <div className="w-full max-w-[440px]">
                <div
                  aria-label={`${featured.title} cover art`}
                  className="aspect-square w-full rounded-lg border border-white/12 shadow-[0_26px_90px_rgba(0,0,0,.55)]"
                  style={coverStyle(featured.coverUrl)}
                />
                <div className="-mt-16 ml-4 mr-4 rounded-lg border border-white/12 bg-[#090a0f]/92 p-4 shadow-2xl backdrop-blur md:ml-8 md:mr-0">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/34">
                        Featured license
                      </p>
                      <h2 className="mt-1 truncate text-xl font-black">
                        {featured.title}
                      </h2>
                      <p className="text-sm text-white/48">{featured.artist}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-accent-300">
                        {formatPrice(featured.licensePrice)}
                      </p>
                      <p className="text-xs text-white/42">
                        {remainingLicenses(featured)} left
                      </p>
                    </div>
                  </div>
                  <AudioPlayer
                    audioUrl={featured.audioUrl}
                    title={featured.title}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="overflow-hidden border-b border-white/8 bg-[#0a0b10] py-3">
        <div className="flex animate-[marquee_28s_linear_infinite] gap-10 whitespace-nowrap text-xs font-bold uppercase tracking-[0.24em] text-white/34">
          {[
            "Rights-clear previews",
            "Limited license drops",
            "Artist-led pricing",
            "AI-assisted discovery",
            "Versus battles",
            "3D music city",
            "Revenue participation",
            "Rights-clear previews",
            "Limited license drops",
            "Artist-led pricing",
            "AI-assisted discovery",
            "Versus battles",
          ].map((item, index) => (
            <span key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      </div>

      <section className="w-full bg-[#050509] px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 border-b border-white/10 pb-7 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-brand-300">
                Preview the catalog
              </p>
              <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-tight md:text-5xl">
                Hear the cue, then see the terms.
              </h2>
            </div>
            <Link
              href="/marketplace"
              className="inline-flex h-11 w-fit items-center gap-2 rounded-md border border-white/14 px-5 text-sm font-bold text-white/64 transition hover:border-white/30 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Full catalog
              <ArrowRightIcon />
            </Link>
          </div>

          <div className="divide-y divide-white/10">
            {sampleSongs.map((song, index) => (
              <article
                key={song.id}
                className="grid gap-5 py-7 md:grid-cols-[120px_minmax(0,1fr)_minmax(270px,0.7fr)] md:items-center"
              >
                <Link
                  href={`/track/${song.id}`}
                  aria-label={`Open ${song.title}`}
                  className="group block"
                >
                  <div
                    className="aspect-square w-24 rounded-lg border border-white/10 transition group-hover:scale-[1.03] group-hover:border-accent-400/45 md:w-full"
                    style={coverStyle(song.coverUrl)}
                  />
                </Link>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/36">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {song.genre && <span>{song.genre}</span>}
                    {song.bpm && <span>{song.bpm} BPM</span>}
                    {song.key && <span>{song.key}</span>}
                  </div>
                  <h3 className="mt-2 text-2xl font-black tracking-tight">
                    {song.title}
                  </h3>
                  <p className="mt-1 text-sm text-white/48">{song.artist}</p>
                  {song.description && (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-white/54">
                      {song.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold text-white/52">
                    <span className="rounded-md bg-white/6 px-2.5 py-1">
                      {formatPrice(song.licensePrice)}
                    </span>
                    <span className="rounded-md bg-white/6 px-2.5 py-1">
                      {song.revenueSharePct}% share
                    </span>
                    <span className="rounded-md bg-white/6 px-2.5 py-1">
                      {song.soldLicenses}/{song.totalLicenses} claimed
                    </span>
                    <span className="rounded-md bg-white/6 px-2.5 py-1">
                      EMS {song.aiScore.toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <AudioPlayer audioUrl={song.audioUrl} title={song.title} songId={song.id} />
                  <Link
                    href={`/track/${song.id}`}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-accent-400/34 bg-accent-500/8 text-sm font-bold text-accent-200 transition hover:bg-accent-500/14 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                  >
                    View license
                    <ArrowRightIcon />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full border-y border-white/8 bg-[#0a0b10] px-4 py-20 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-gold-300">
              Discovery city
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              Music earns better placement as it proves demand.
            </h2>
            <p className="mt-5 text-base leading-8 text-white/55">
              EMS ranks songs into districts using score, battle wins, plays,
              and license movement. Creators get a sharper catalog. Artists get
              a visible ladder.
            </p>
            <Link
              href="/city"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-md bg-gold-400 px-5 text-sm font-black text-[#090a0f] transition hover:bg-gold-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Open city view
              <CityIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="divide-y divide-white/10 border-y border-white/10">
            {districtRows.map((district) => (
              <div
                key={district.name}
                className="grid gap-4 py-6 md:grid-cols-[0.8fr_0.8fr_1.3fr] md:items-center"
              >
                <h3 className="text-2xl font-black">{district.name}</h3>
                <div className="text-sm">
                  <p className="font-bold text-accent-200">{district.score}</p>
                  <p className="mt-1 text-white/42">{district.lift}</p>
                </div>
                <p className="text-sm leading-6 text-white/55">
                  {district.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="w-full bg-[#050509] px-4 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-accent-300">
                Two sides of the deal
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
                Fast for creators. Serious for artists.
              </h2>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="border-l border-white/12 pl-5">
                <ShieldIcon className="mb-4 h-6 w-6 text-accent-300" />
                <h3 className="text-xl font-black">For creators</h3>
                <p className="mt-3 text-sm leading-6 text-white/54">
                  Find music that already explains its price, rights, supply,
                  and revenue participation before you buy.
                </p>
                <ul className="mt-5 space-y-3">
                  {creatorChecks.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-white/62">
                      <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-accent-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-l border-white/12 pl-5">
                <WaveIcon className="mb-4 h-6 w-6 text-brand-300" />
                <h3 className="text-xl font-black">For artists</h3>
                <p className="mt-3 text-sm leading-6 text-white/54">
                  Upload the track, control the drop, and let real demand push
                  the release through the city.
                </p>
                <ul className="mt-5 space-y-3">
                  {artistChecks.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-white/62">
                      <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-brand-300" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {platformLinks.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group rounded-lg border border-white/10 bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-white/22 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <h3 className="flex items-center justify-between gap-4 text-lg font-black">
                  {item.title}
                  <ArrowRightIcon className="h-4 w-4 text-white/38 transition group-hover:translate-x-1 group-hover:text-accent-300" />
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/52">
                  {item.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-t border-white/8 bg-[#0a0b10] px-4 py-20 md:py-28">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/60 to-transparent" />
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[1fr_0.8fr] md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-white/38">
              Start with the next cue
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">
              License a track or release your own before the next drop moves.
            </h2>
          </div>

          <div>
            <div className="mb-7 flex h-28 items-end gap-1 border-b border-white/12">
              {waveBars.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="flex-1 rounded-t bg-gradient-to-t from-brand-500 to-accent-300 opacity-80 animate-[waveform-dance_1.8s_ease-in-out_infinite]"
                  style={{
                    height: `${height}%`,
                    animationDelay: `${index * 80}ms`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/marketplace"
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-white px-6 text-sm font-black text-[#050509] transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Browse tracks
                <ArrowRightIcon />
              </Link>
              <Link
                href="/auth/signup"
                className="inline-flex h-12 flex-1 items-center justify-center rounded-md border border-white/16 px-6 text-sm font-bold text-white/70 transition hover:border-white/32 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                Create account
              </Link>
            </div>
            <p className="mt-4 text-xs leading-5 text-white/34">
              Browsing is open. Checkout, releases, payouts, and saved licenses
              use account access.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
