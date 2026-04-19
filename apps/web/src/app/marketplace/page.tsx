import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const songs = await prisma.song.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">Marketplace</h1>
        <p className="mt-2 text-white/50">
          Browse available music licenses. Each license earns you a share of
          streaming revenue.
        </p>
      </div>

      {songs.length === 0 ? (
        <div className="py-24 text-center text-white/30">
          <div className="mb-4 text-6xl">🎵</div>
          <p className="text-xl font-semibold">No songs listed yet.</p>
          <p className="mt-2 text-sm">
            Artists are warming up — check back soon!
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {songs.map((song) => (
            <SongCard
              key={song.id}
              id={song.id}
              title={song.title}
              artist={song.artist}
              genre={song.genre}
              coverUrl={song.coverUrl}
              licensePrice={song.licensePrice}
              revenueSharePct={song.revenueSharePct}
              soldLicenses={song.soldLicenses}
              totalLicenses={song.totalLicenses}
            />
          ))}
        </div>
      )}
    </div>
  );
}
