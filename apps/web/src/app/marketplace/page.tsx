import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

type SortKey = "trending" | "newest" | "price_asc" | "price_desc" | "rev_desc";

interface Props {
  searchParams: Promise<{
    search?: string;
    genre?: string;
    sort?: SortKey;
  }>;
}

export default async function MarketplacePage({ searchParams }: Props) {
  const { search = "", genre = "", sort = "trending" } = await searchParams;

  // Build Prisma orderBy from sort param
  type OrderBy =
    | { aiScore: "desc" }
    | { createdAt: "desc" }
    | { licensePrice: "asc" | "desc" }
    | { revenueSharePct: "desc" }
    | { soldLicenses: "desc" };

  const orderBy: OrderBy[] =
    sort === "newest"     ? [{ createdAt: "desc" }]
    : sort === "price_asc"  ? [{ licensePrice: "asc" }, { aiScore: "desc" }]
    : sort === "price_desc" ? [{ licensePrice: "desc" }, { aiScore: "desc" }]
    : sort === "rev_desc"   ? [{ revenueSharePct: "desc" }, { aiScore: "desc" }]
    : /* trending */          [{ aiScore: "desc" }, { soldLicenses: "desc" }];

  const where = {
    isActive: true,
    ...(genre ? { genre: { equals: genre, mode: "insensitive" as const } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { artist: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [trendingSongs, allSongs] = await Promise.all([
    // Trending section only when no filter is active
    !search && !genre && sort === "trending"
      ? prisma.song.findMany({
          where: { isActive: true },
          orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
          take: 4,
        })
      : Promise.resolve([]),
    prisma.song.findMany({ where, orderBy }),
  ]);

  const trendingIds = new Set(trendingSongs.map((s) => s.id));
  const isFiltered = !!(search || genre || sort !== "trending");

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-3 py-1 text-xs font-semibold text-brand-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
          Live marketplace
        </div>
        <h1 className="text-4xl font-extrabold">
          <span className="text-gradient-ems">Marketplace</span>
        </h1>
        <p className="mt-2 text-white/45">
          Buy digital licenses. Earn a share of streaming revenue — forever.
        </p>
      </div>

      {/* ── Search + Filters ────────────────────────────── */}
      <Suspense>
        <MarketplaceFilters totalCount={allSongs.length} />
      </Suspense>

      {allSongs.length === 0 ? (
        <div className="py-24 text-center">
          <div className="mb-4 text-6xl">🎵</div>
          <p className="text-xl font-semibold text-white/50">
            {isFiltered ? "No songs match your search." : "No songs listed yet."}
          </p>
          <p className="mt-2 text-sm text-white/30">
            {isFiltered
              ? "Try different keywords or clear the filters."
              : "Artists are warming up — check back soon!"}
          </p>
        </div>
      ) : (
        <>
          {/* ── Trending section (only when no filters active) ── */}
          {trendingSongs.length > 0 && !isFiltered && (
            <section className="mb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-xl font-bold">🔥 Trending Now</h2>
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
                    licensePrice={song.licensePrice}
                    revenueSharePct={song.revenueSharePct}
                    soldLicenses={song.soldLicenses}
                    totalLicenses={song.totalLicenses}
                    aiScore={song.aiScore}
                    isTrending={true}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── All songs ─────────────────────────────────── */}
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {isFiltered ? "Results" : "All Listings"}
              </h2>
              <span className="text-sm text-white/35">{allSongs.length} songs</span>
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
                  licensePrice={song.licensePrice}
                  revenueSharePct={song.revenueSharePct}
                  soldLicenses={song.soldLicenses}
                  totalLicenses={song.totalLicenses}
                  aiScore={song.aiScore}
                  isTrending={trendingIds.has(song.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
