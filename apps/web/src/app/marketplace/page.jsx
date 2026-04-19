import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
export const dynamic = "force-dynamic";
export default async function MarketplacePage() {
    const [trendingSongs, allSongs] = await Promise.all([
        prisma.song.findMany({
            where: { isActive: true },
            orderBy: [{ aiScore: "desc" }, { soldLicenses: "desc" }],
            take: 4,
        }),
        prisma.song.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
        }),
    ]);
    // Songs that are in top-4 by AI score are "trending"
    const trendingIds = new Set(trendingSongs.map((s) => s.id));
    return (<div className="mx-auto max-w-7xl px-4 py-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="mb-10">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/8 px-3 py-1 text-xs font-semibold text-brand-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse"/>
          Live marketplace
        </div>
        <h1 className="text-4xl font-extrabold">
          <span className="text-gradient-ems">Marketplace</span>
        </h1>
        <p className="mt-2 text-white/45">
          Buy digital licenses. Earn a share of streaming revenue — forever.
        </p>
      </div>

      {allSongs.length === 0 ? (<div className="py-24 text-center">
          <div className="mb-4 text-6xl">🎵</div>
          <p className="text-xl font-semibold text-white/50">No songs listed yet.</p>
          <p className="mt-2 text-sm text-white/30">Artists are warming up — check back soon!</p>
        </div>) : (<>
          {/* ── Trending section ──────────────────────── */}
          {trendingSongs.length > 0 && (<section className="mb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-xl font-bold">🔥 Trending Now</h2>
                <span className="badge-trending">Hot</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {trendingSongs.map((song) => (<SongCard key={song.id} id={song.id} title={song.title} artist={song.artist} genre={song.genre} coverUrl={song.coverUrl} licensePrice={song.licensePrice} revenueSharePct={song.revenueSharePct} soldLicenses={song.soldLicenses} totalLicenses={song.totalLicenses} aiScore={song.aiScore} isTrending={true}/>))}
              </div>
            </section>)}

          {/* ── All songs ─────────────────────────────── */}
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">All Listings</h2>
              <span className="text-sm text-white/35">{allSongs.length} songs</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {allSongs.map((song) => (<SongCard key={song.id} id={song.id} title={song.title} artist={song.artist} genre={song.genre} coverUrl={song.coverUrl} licensePrice={song.licensePrice} revenueSharePct={song.revenueSharePct} soldLicenses={song.soldLicenses} totalLicenses={song.totalLicenses} aiScore={song.aiScore} isTrending={trendingIds.has(song.id)}/>))}
            </div>
          </section>
        </>)}
    </div>);
}
