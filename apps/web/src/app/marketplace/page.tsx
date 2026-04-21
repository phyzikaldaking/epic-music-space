import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import LiveMarketplaceFeed from "@/components/LiveMarketplaceFeed";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Song } from "@ems/db";
import Link from "next/link";

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

  // Build Prisma orderBy from sort param
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
            : /* trending */ [{ aiScore: "desc" }, { soldLicenses: "desc" }];

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

  let trendingSongs: Song[] = [];
  let allSongs: Song[] = [];
  let totalCount = 0;
  let catalogUnavailable = !process.env.DATABASE_URL;

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
    <div className="mx-auto max-w-7xl px-4 py-12">
      {!catalogUnavailable && <LiveMarketplaceFeed />}
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-3 py-1 text-xs font-semibold text-brand-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 motion-safe:animate-pulse" />
          {catalogUnavailable ? "Catalog syncing" : "Live marketplace"}
        </div>
        <h1 className="text-4xl font-extrabold">
          <span className="text-gradient-ems">Marketplace</span>
        </h1>
        <p className="mt-2 text-white/45">
          Buy digital licenses and review participation terms before checkout.
        </p>
      </div>

      <Suspense>
        <MarketplaceFilters totalCount={allSongs.length} />
      </Suspense>

      {catalogUnavailable ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-6 py-16 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-brand-500/30 bg-brand-500/10 text-brand-300"
          >
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" />
            </svg>
          </div>
          <p className="text-xl font-semibold text-white">
            The catalog is temporarily unavailable.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/45">
            The marketplace page is still online, but the track database could
            not be reached. Try again shortly, or start an artist upload while
            the catalog reconnects.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/studio/new"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-sm font-bold text-white transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Upload a track
            </Link>
            <Link
              href="/legal/licensing"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/16 px-5 text-sm font-bold text-white/70 transition hover:border-white/32 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Review licensing
            </Link>
          </div>
        </div>
      ) : allSongs.length === 0 ? (
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
            <section className="mb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-xl font-bold">Trending Now</h2>
                <span className="badge-trending">Hot</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {trendingSongs.map((song) => (
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
                    isTrending={true}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {isFiltered ? "Results" : "All Listings"}
              </h2>
              <span className="text-sm text-white/35">
                {totalCount > 0
                  ? `${totalCount} song${totalCount !== 1 ? "s" : ""}`
                  : allSongs.length > 0
                  ? `${allSongs.length} song${allSongs.length !== 1 ? "s" : ""}`
                  : null}
              </span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          </section>

          {/* Pagination */}
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
                Page{" "}
                <span className="font-bold text-white">{page}</span>
                {" "}of{" "}
                <span className="font-bold text-white">{totalPages}</span>
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
  );
}
