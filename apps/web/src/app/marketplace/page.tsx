import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import LiveMarketplaceFeed from "@/components/LiveMarketplaceFeed";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Song } from "@ems/db";
import Link from "next/link";
import { demoTracks } from "@/lib/demoTracks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Music Licenses",
  description:
    "Search independent tracks by genre, artist, price, and revenue share before licensing music for creator projects.",
  alternates: {
    canonical: "/marketplace",
  },
};

type SortKey = "trending" | "newest" | "price_asc" | "price_desc" | "rev_desc";
type TempoKey = "slow" | "mid" | "fast";
type PriceLike = string | number | { toString(): string };
type MarketplaceSong = Omit<
  Pick<
    Song,
    | "id"
    | "title"
    | "artist"
    | "genre"
    | "coverUrl"
    | "audioUrl"
    | "soldLicenses"
    | "totalLicenses"
    | "bpm"
    | "key"
    | "aiScore"
  >,
  never
> & {
  licensePrice: PriceLike;
  revenueSharePct: PriceLike;
};

interface Props {
  searchParams: Promise<{
    search?: string;
    genre?: string;
    sort?: SortKey;
    tempo?: TempoKey;
    page?: string;
  }>;
}

export default async function MarketplacePage({ searchParams }: Props) {
  const {
    search = "",
    genre = "",
    sort = "trending",
    tempo = "",
    page: pageParam = "1",
  } = await searchParams;

  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  type OrderBy =
    | { aiScore: "desc" }
    | { createdAt: "desc" }
    | { licensePrice: "asc" | "desc" }
    | { revenueSharePct: "desc" }
    | { soldLicenses: "desc" };

  const orderBy: OrderBy[] =
    sort === "newest"
      ? [{ createdAt: "desc" }]
      : sort === "price_asc"
        ? [{ licensePrice: "asc" }, { aiScore: "desc" }]
        : sort === "price_desc"
          ? [{ licensePrice: "desc" }, { aiScore: "desc" }]
          : sort === "rev_desc"
            ? [{ revenueSharePct: "desc" }, { aiScore: "desc" }]
            : [{ aiScore: "desc" }, { soldLicenses: "desc" }];

  const where = {
    isActive: true,
    ...(genre
      ? { genre: { equals: genre, mode: "insensitive" as const } }
      : {}),
    ...(tempo === "slow"
      ? { bpm: { lt: 90 } }
      : tempo === "mid"
        ? { bpm: { gte: 90, lte: 130 } }
        : tempo === "fast"
          ? { bpm: { gt: 130 } }
          : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { artist: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const PAGE_SIZE = 24;

  let trendingSongs: MarketplaceSong[] = [];
  let allSongs: MarketplaceSong[] = [];
  let totalCount = 0;
  let catalogUnavailable = !hasUsableDatabaseUrl();

  if (!catalogUnavailable) {
    try {
      [trendingSongs, allSongs, totalCount] = await Promise.all([
        !search && !genre && !tempo && sort === "trending" && page === 1
          ? prisma.song.findMany({
              where: { isActive: true },
              orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
              take: 4,
            })
          : Promise.resolve([]),
        prisma.song.findMany({
          where,
          orderBy,
          take: PAGE_SIZE,
          skip: (page - 1) * PAGE_SIZE,
        }),
        prisma.song.count({ where }),
      ]);
    } catch (error) {
      catalogUnavailable = true;
      console.warn("[marketplace] Failed to load catalog", error);
    }
  }

  if (catalogUnavailable) {
    const demoSongs = getDemoMarketplaceSongs({ search, genre, tempo, sort });
    trendingSongs =
      !search && !genre && !tempo && sort === "trending" && page === 1
        ? demoSongs.slice(0, 3)
        : [];
    allSongs = demoSongs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    totalCount = demoSongs.length;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (genre) params.set("genre", genre);
    if (sort !== "trending") params.set("sort", sort);
    if (tempo) params.set("tempo", tempo);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/marketplace${qs ? `?${qs}` : ""}`;
  }

  const trendingIds = new Set(trendingSongs.map((s) => s.id));
  const isFiltered = !!(search || genre || tempo || sort !== "trending");

  return (
    <div className="min-h-screen overflow-hidden bg-[#050509]">
      {!catalogUnavailable && <LiveMarketplaceFeed />}
      <section className="relative overflow-hidden border-b border-white/8 px-4 py-14 md:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(108,92,231,.18),transparent_30%),radial-gradient(circle_at_84%_22%,rgba(0,245,255,.14),transparent_26%),linear-gradient(180deg,#070712,#050509)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(90deg,transparent,rgba(0,245,255,.18),transparent)] blur-2xl" />
        <div className="relative mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.7fr] lg:items-end">
            <div>
              <p className="mb-4 border-l-2 border-accent-400 pl-3 text-xs font-black uppercase tracking-[0.24em] text-accent-300">
                {catalogUnavailable ? "Demo catalog" : "Live marketplace"} · Phase 2 Studio Wall
              </p>
              <h1 className="max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
                Browse the wall like a cinematic music control room.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/58">
                Pan across wall-mounted beat screens, preview reactive waveforms,
                then open the Netflix-style license overlay before checkout.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4 border-y border-white/10 py-6 lg:border-y-0 lg:border-l lg:py-0 lg:pl-8">
              <div>
                <dd className="text-3xl font-black text-white">
                  {totalCount || allSongs.length}
                </dd>
                <dt className="mt-1 text-xs uppercase tracking-[0.18em] text-white/36">
                  Screens
                </dt>
              </div>
              <div>
                <dd className="text-3xl font-black text-accent-300">Zoom</dd>
                <dt className="mt-1 text-xs uppercase tracking-[0.18em] text-white/36">
                  Focus mode
                </dt>
              </div>
              <div>
                <dd className="text-3xl font-black text-gold-300">Capped</dd>
                <dt className="mt-1 text-xs uppercase tracking-[0.18em] text-white/36">
                  Supply
                </dt>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-7xl px-4 py-10">
        <div className="pointer-events-none absolute inset-x-0 top-20 h-[520px] rounded-[3rem] bg-[radial-gradient(circle_at_50%_0%,rgba(0,245,255,.11),transparent_55%)]" />
        <Suspense>
          <MarketplaceFilters totalCount={totalCount} />
        </Suspense>

        {allSongs.length === 0 ? (
          <div className="py-24 text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/45"
            >
              <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
              </svg>
            </div>
            <p className="text-xl font-semibold text-white/50">
              {isFiltered
                ? "No songs match your search."
                : "No songs listed yet."}
            </p>
            <p className="mt-2 text-sm text-white/30">
              {isFiltered
                ? "Try different keywords or clear the filters."
                : "Artists can publish the first licensable tracks now."}
            </p>
          </div>
        ) : (
          <>
            {trendingSongs.length > 0 && !isFiltered && (
              <section className="mb-14 rounded-[2rem] border border-white/10 bg-white/[0.025] p-5 shadow-2xl shadow-black/40">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black">Trending Studio Screens</h2>
                    <span className="badge-trending">Hot</span>
                  </div>
                  <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-white/32 sm:inline">
                    Hover to zoom · Play to activate
                  </span>
                </div>
                <div className="overflow-x-auto overflow-y-visible pb-8 pt-3 [perspective:1400px]">
                  <div className="flex min-w-max gap-6 pr-8">
                    {trendingSongs.map((song) => (
                      <div key={song.id} className="w-[300px] shrink-0">
                        <SongCard
                          id={song.id}
                          title={song.title}
                          artist={song.artist}
                          genre={song.genre}
                          coverUrl={song.coverUrl}
                          audioUrl={song.audioUrl}
                          licensePrice={song.licensePrice.toString()}
                          revenueSharePct={song.revenueSharePct.toString()}
                          soldLicenses={song.soldLicenses}
                          totalLicenses={song.totalLicenses}
                          bpm={song.bpm}
                          musicalKey={song.key}
                          aiScore={song.aiScore}
                          isTrending={true}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="relative rounded-[2.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))] p-4 shadow-2xl shadow-black/50 md:p-6">
              <div className="pointer-events-none absolute inset-0 rounded-[2.4rem] bg-[linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
              <div className="relative mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-accent-300/80">
                    3D Studio Wall Grid
                  </p>
                  <h2 className="mt-1 text-2xl font-black">
                    {isFiltered ? "Focused Results" : "All Wall Screens"}
                  </h2>
                </div>
                <span className="text-sm text-white/35">
                  {totalCount > 0
                    ? `${totalCount} song${totalCount !== 1 ? "s" : ""}`
                    : allSongs.length > 0
                    ? `${allSongs.length} song${allSongs.length !== 1 ? "s" : ""}`
                    : null}
                </span>
              </div>

              <div className="relative overflow-x-auto overflow-y-visible pb-10 pt-3 [perspective:1600px] xl:overflow-visible">
                <div className="grid min-w-[920px] gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:min-w-0 xl:grid-cols-4">
                  {allSongs.map((song) => (
                    <SongCard
                      key={song.id}
                      id={song.id}
                      title={song.title}
                      artist={song.artist}
                      genre={song.genre}
                      coverUrl={song.coverUrl}
                      audioUrl={song.audioUrl}
                      licensePrice={song.licensePrice.toString()}
                      revenueSharePct={song.revenueSharePct.toString()}
                      soldLicenses={song.soldLicenses}
                      totalLicenses={song.totalLicenses}
                      bpm={song.bpm}
                      musicalKey={song.key}
                      aiScore={song.aiScore}
                      isTrending={trendingIds.has(song.id)}
                    />
                  ))}
                </div>
              </div>
            </section>

            {totalPages > 1 && (
              <nav
                aria-label="Marketplace pagination"
                className="mt-10 flex items-center justify-between border-t border-white/8 pt-6"
              >
                <Link
                  href={buildPageUrl(page - 1)}
                  aria-disabled={page <= 1}
                  tabIndex={page <= 1 ? -1 : 0}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    page <= 1
                      ? "pointer-events-none border-white/6 text-white/20"
                      : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                  Previous
                </Link>

                <p className="text-sm text-white/40">
                  Page <span className="font-bold text-white">{page}</span> of <span className="font-bold text-white">{totalPages}</span>
                </p>

                <Link
                  href={buildPageUrl(page + 1)}
                  aria-disabled={page >= totalPages}
                  tabIndex={page >= totalPages ? -1 : 0}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                    page >= totalPages
                      ? "pointer-events-none border-white/6 text-white/20"
                      : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"
                  }`}
                >
                  Next
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}

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

function getDemoMarketplaceSongs({
  search,
  genre,
  tempo,
  sort,
}: {
  search: string;
  genre: string;
  tempo: string;
  sort: SortKey;
}): MarketplaceSong[] {
  const query = search.toLowerCase().trim();
  const songs = demoTracks
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist,
      genre: track.genre,
      coverUrl: track.coverUrl,
      audioUrl: track.audioUrl,
      licensePrice: track.licensePrice,
      revenueSharePct: track.revenueSharePct,
      soldLicenses: track.soldLicenses,
      totalLicenses: track.totalLicenses,
      bpm: track.bpm,
      key: track.key,
      aiScore: track.aiScore,
    }))
    .filter((song) => {
      const matchesSearch =
        !query ||
        song.title.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query);
      const matchesGenre =
        !genre || song.genre?.toLowerCase() === genre.toLowerCase();
      const matchesTempo =
        !tempo ||
        (tempo === "slow" && song.bpm < 90) ||
        (tempo === "mid" && song.bpm >= 90 && song.bpm <= 130) ||
        (tempo === "fast" && song.bpm > 130);
      return matchesSearch && matchesGenre && matchesTempo;
    });

  return songs.sort((a, b) => {
    if (sort === "price_asc") {
      return Number(a.licensePrice) - Number(b.licensePrice);
    }
    if (sort === "price_desc") {
      return Number(b.licensePrice) - Number(a.licensePrice);
    }
    if (sort === "rev_desc") {
      return Number(b.revenueSharePct) - Number(a.revenueSharePct);
    }
    return b.aiScore - a.aiScore || b.soldLicenses - a.soldLicenses;
  });
}
