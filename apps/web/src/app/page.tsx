import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { CACHE_TAGS } from "@/lib/cacheTags";
import { getDemoTracks } from "@/lib/demoTracks";
import { isLaunchCatalogTrack, isPublicCatalogTrack } from "@/lib/launchCatalog";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@ems/utils";

export const revalidate = 60;

export const metadata: Metadata = {
  title: { absolute: "Epic Music Space — Independent Music in Motion" },
  description:
    "Discover independent music, build in a browser-based artist studio, and license tracks with clear terms.",
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
  liveRoomCount: number;
  sampleSongs: SampleSong[];
};

function mapDemoTracksToSampleSongs(
  tracks: Awaited<ReturnType<typeof getDemoTracks>>,
): SampleSong[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    genre: track.genre,
    audioUrl: track.audioUrl,
    coverUrl: track.coverUrl,
    bpm: track.bpm,
    key: track.key,
    licensePrice: track.licensePrice,
    revenueSharePct: track.revenueSharePct,
    totalLicenses: track.totalLicenses,
    soldLicenses: track.soldLicenses,
    aiScore: track.aiScore,
    description: track.description,
  }));
}

const getHomeData = unstable_cache(
  async (): Promise<HomeData> => {
    const demoSampleSongs = mapDemoTracksToSampleSongs(await getDemoTracks());
    const fallback: HomeData = {
      songCount: 0,
      licenseCount: 0,
      totalRevenue: 0,
      liveRoomCount: 0,
      sampleSongs: demoSampleSongs.slice(0, 4),
    };

    if (!hasUsableDatabaseUrl()) return fallback;

    try {
      const [songCount, licenseCount, transactionSum, liveRoomCount, songs] =
        await withTimeout(
          Promise.all([
            prisma.song.count({ where: { isActive: true } }),
            prisma.licenseToken.count({ where: { status: "ACTIVE" } }),
            prisma.transaction.aggregate({
              where: { status: "SUCCEEDED", type: "LICENSE_PURCHASE" },
              _sum: { amount: true },
            }),
            prisma.room.count({ where: { status: "LIVE" } }),
            prisma.song.findMany({
              where: { isActive: true, audioUrl: { not: "" } },
              orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
              take: 12,
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
          ]),
          2500,
        );

      const sampleSongs = [...songs]
        .filter(isPublicCatalogTrack)
        .sort(
          (a, b) =>
            Number(isLaunchCatalogTrack(a)) - Number(isLaunchCatalogTrack(b)),
        )
        .slice(0, 4)
        .map((song) => ({
          ...song,
          licensePrice: song.licensePrice.toString(),
          revenueSharePct: song.revenueSharePct.toString(),
        }));

      return {
        songCount,
        licenseCount,
        totalRevenue: Number(transactionSum._sum.amount ?? 0),
        liveRoomCount,
        sampleSongs:
          sampleSongs.length > 0 ? sampleSongs : fallback.sampleSongs,
      };
    } catch {
      return fallback;
    }
  },
  ["homepage-black-label-v1"],
  { revalidate: 3600, tags: [CACHE_TAGS.homepage, CACHE_TAGS.songs] },
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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Homepage data fetch timed out")), ms);
    }),
  ]);
}

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

const paths = [
  {
    number: "01",
    title: "Listen",
    copy: "Find voices moving before the charts do. Follow artists, join live sessions, and keep the music close.",
    href: "/trending",
    cta: "Discover music",
  },
  {
    number: "02",
    title: "Create",
    copy: "Record, shape, upload, and publish from one browser-based studio built around the work.",
    href: "/auth/signin?callbackUrl=/studio",
    cta: "Open Studio",
  },
  {
    number: "03",
    title: "Sell",
    copy: "Offer clear digital licenses, reach new buyers, and see the fee before a payout ever moves.",
    href: "/onboarding/creator",
    cta: "Start creating",
  },
];

export default async function HomePage() {
  const { songCount, licenseCount, totalRevenue, liveRoomCount, sampleSongs } =
    await getHomeData();
  const proof = [
    songCount >= 5
      ? { value: `${formatCount(songCount)}+`, label: "active tracks" }
      : null,
    licenseCount >= 1
      ? { value: `${formatCount(licenseCount)}+`, label: "licenses claimed" }
      : null,
    liveRoomCount >= 1
      ? { value: `${formatCount(liveRoomCount)}`, label: "rooms live now" }
      : null,
    totalRevenue >= 1
      ? { value: `$${formatCount(totalRevenue)}`, label: "artist sales" }
      : null,
  ].filter((item): item is { value: string; label: string } => item !== null);

  return (
    <div className="overflow-hidden bg-[#080808] text-[#f2ede3]">
      <section className="relative min-h-[760px] border-b border-white/10 lg:min-h-[820px]">
        <Image
          src="/images/ems-black-label-hero.png"
          alt="Independent artist performing at a microphone in a dimly lit studio"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[67%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,0.98)_0%,rgba(8,8,8,0.88)_35%,rgba(8,8,8,0.34)_68%,rgba(8,8,8,0.58)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.18)_0%,rgba(8,8,8,0.1)_68%,#080808_100%)]" />

        <div className="relative mx-auto flex min-h-[760px] max-w-7xl items-center px-5 py-28 sm:px-8 lg:min-h-[820px] lg:px-10">
          <div className="max-w-3xl">
            <p className="mb-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#c9a96e] sm:text-xs">
              <span className="h-px w-10 bg-[#c9a96e]" />
              Independent music, in motion
            </p>
            <h1 className="max-w-3xl text-[clamp(4rem,10vw,8.75rem)] font-black uppercase leading-[0.82] tracking-[-0.055em] text-[#f2ede3]">
              Make the work.
              <br />
              <span className="font-serif font-normal italic text-[#c9a96e]">
                Move the culture.
              </span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-[#d1cbc0]/80 sm:text-lg">
              A home for independent music to be made, heard, and owned on clear
              terms. No spectacle between you and the work.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/signin?callbackUrl=/studio"
                className="inline-flex min-h-12 items-center justify-center bg-[#c9a96e] px-7 text-xs font-bold uppercase tracking-[0.18em] text-[#080808] transition hover:bg-[#e0c48d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Sign in to open Studio
              </Link>
              <Link
                href="/marketplace"
                className="inline-flex min-h-12 items-center justify-center border border-[#f2ede3]/35 bg-black/20 px-7 text-xs font-bold uppercase tracking-[0.18em] text-[#f2ede3] backdrop-blur-sm transition hover:border-[#c9a96e] hover:text-[#c9a96e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
              >
                Explore music
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-7 left-1/2 hidden w-full max-w-7xl -translate-x-1/2 items-center justify-between px-10 text-[10px] uppercase tracking-[0.26em] text-white/40 lg:flex">
          <span>Epic Music Space / 2026</span>
          <span>Scroll to enter</span>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mb-12 flex flex-col justify-between gap-6 border-b border-white/15 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#c9a96e]">
              Catalog / live
            </p>
            <h2 className="mt-3 text-4xl font-black uppercase tracking-[-0.04em] sm:text-6xl">
              Currently moving
            </h2>
          </div>
          <Link
            href="/marketplace"
            className="text-xs font-bold uppercase tracking-[0.18em] text-[#d1cbc0]/65 transition hover:text-[#c9a96e]"
          >
            View the full catalog →
          </Link>
        </div>

        <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {sampleSongs.map((song, index) => (
            <article key={song.id} className="group bg-[#080808] p-4 sm:p-5">
              <Link
                href={`/track/${song.id}`}
                className="relative block aspect-[4/5] overflow-hidden bg-[#181716] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a96e]"
              >
                {song.coverUrl ? (
                  <Image
                    src={song.coverUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover grayscale transition duration-500 group-hover:scale-[1.03] group-hover:grayscale-0"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(201,169,110,0.25),transparent_40%),linear-gradient(145deg,#24211d,#0e0e0e)]" />
                )}
                <span className="absolute left-4 top-4 text-xs font-semibold tracking-[0.2em] text-white/60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-sm transition group-hover:border-[#c9a96e] group-hover:text-[#c9a96e]">
                  ▶
                </span>
              </Link>
              <div className="mt-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/track/${song.id}`}
                    className="block truncate text-xl font-bold uppercase tracking-[-0.02em] transition hover:text-[#c9a96e]"
                  >
                    {song.title}
                  </Link>
                  <p className="mt-1 truncate text-sm text-[#d1cbc0]/55">
                    {song.artist}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-[#c9a96e]">
                  {formatPrice(song.licensePrice)}
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[10px] uppercase tracking-[0.18em] text-white/35">
                <span>{song.genre ?? "Independent"}</span>
                <span>{song.bpm ? `${song.bpm} BPM` : "Available"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#11110f]">
        <div className="mx-auto grid max-w-7xl lg:grid-cols-3">
          {paths.map((path) => (
            <article
              key={path.number}
              className="group border-b border-white/10 px-5 py-16 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-24 last:lg:border-r-0"
            >
              <span className="text-xs font-semibold tracking-[0.22em] text-[#c9a96e]">
                {path.number}
              </span>
              <h2 className="mt-14 text-5xl font-black uppercase tracking-[-0.045em] transition group-hover:text-[#c9a96e]">
                {path.title}
              </h2>
              <p className="mt-5 max-w-sm text-sm leading-7 text-[#d1cbc0]/60">
                {path.copy}
              </p>
              <Link
                href={path.href}
                className="mt-10 inline-flex border-b border-[#c9a96e]/50 pb-1 text-xs font-bold uppercase tracking-[0.18em] text-[#f2ede3] transition hover:border-[#c9a96e] hover:text-[#c9a96e]"
              >
                {path.cta} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-36">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#c9a96e]">
            Built on clear terms
          </p>
          <h2 className="mt-5 max-w-3xl text-5xl font-black uppercase leading-[0.92] tracking-[-0.05em] sm:text-7xl">
            Your master stays yours.
          </h2>
        </div>
        <div className="lg:pt-14">
          <p className="text-lg leading-8 text-[#d1cbc0]/70">
            Buyers receive a digital license under transparent terms. They do
            not own your music. Artists keep each license sale, with the
            platform fee itemized before payout.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-px bg-white/10">
            <div className="bg-[#080808] p-6">
              <p className="font-serif text-4xl italic text-[#c9a96e]">100%</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                Master ownership
              </p>
            </div>
            <div className="bg-[#080808] p-6">
              <p className="font-serif text-4xl italic text-[#c9a96e]">10%</p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                Clear platform fee
              </p>
            </div>
          </div>
          {proof.length >= 2 && (
            <dl className="mt-px grid grid-cols-2 gap-px bg-white/10">
              {proof.map((item) => (
                <div key={item.label} className="bg-[#080808] p-6">
                  <dt className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    {item.label}
                  </dt>
                  <dd className="mt-2 text-2xl font-bold text-[#f2ede3]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#c9a96e] text-[#080808]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-10 px-5 py-20 sm:px-8 lg:flex-row lg:items-end lg:px-10 lg:py-24">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] opacity-60">
              The next move is yours
            </p>
            <h2 className="mt-4 max-w-4xl text-5xl font-black uppercase leading-[0.88] tracking-[-0.055em] sm:text-7xl">
              Put your music in motion.
            </h2>
          </div>
          <Link
            href="/auth/signup?callbackUrl=/studio/setup"
            className="inline-flex min-h-14 shrink-0 items-center justify-center bg-[#080808] px-8 text-xs font-bold uppercase tracking-[0.2em] text-[#f2ede3] transition hover:bg-[#24211d] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Create your artist account
          </Link>
        </div>
      </section>
    </div>
  );
}
