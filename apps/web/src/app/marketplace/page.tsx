import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import MarketplaceWorld3D from "@/components/MarketplaceWorld3D";
import MarketplacePresence from "@/components/MarketplacePresence";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Song } from "@ems/db";
import { demoTracks } from "@/lib/demoTracks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Music Licenses",
  description: "Search and compete for top-ranked tracks.",
};

type MarketplaceSong = Song & { boostScore?: number };

export default async function MarketplacePage() {
  let allSongs: MarketplaceSong[] = [];

  try {
    allSongs = await prisma.song.findMany({ where: { isActive: true } });
  } catch {
    allSongs = demoTracks as any;
  }

  // 🔥 GLOBAL RANKING ENGINE
  const rankedSongs = allSongs
    .map((s) => ({ ...s, rankScore: (s.aiScore ?? 0) + (s.boostScore ?? 0) }))
    .sort((a, b) => b.rankScore - a.rankScore);

  return (
    <div className="min-h-screen bg-[#050509] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

        <MarketplaceWorld3D items={rankedSongs} />

        <div className="flex justify-end">
          <MarketplacePresence compact />
        </div>

        <Suspense>
          <MarketplaceFilters totalCount={rankedSongs.length} />
        </Suspense>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rankedSongs.map((song) => (
            <SongCard key={song.id} {...song as any} boostScore={song.boostScore} />
          ))}
        </div>

      </div>
    </div>
  );
}
