import { prisma } from "@/lib/prisma";
import SongCard from "@/components/SongCard";
import MarketplaceFilters from "@/components/MarketplaceFilters";
import LiveMarketplaceFeed from "@/components/LiveMarketplaceFeed";
import MarketplaceWorld3D from "@/components/MarketplaceWorld3D";
import MarketplacePresence from "@/components/MarketplacePresence";
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
  const { search = "", genre = "", sort = "trending", tempo = "", page: pageParam = "1" } = await searchParams;

  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  const where = {
    isActive: true,
  };

  const PAGE_SIZE = 24;

  let allSongs: MarketplaceSong[] = [];

  try {
    allSongs = await prisma.song.findMany({
      where,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    });
  } catch {
    allSongs = demoTracks as any;
  }

  return (
    <div className="min-h-screen bg-[#050509] text-white">
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

        {/* 🔥 ENTRY EXPERIENCE: 3D WORLD */}
        <MarketplaceWorld3D items={allSongs} />

        {/* 🔥 LIVE PRESENCE */}
        <div className="flex justify-end">
          <MarketplacePresence compact />
        </div>

        <Suspense>
          <MarketplaceFilters totalCount={allSongs.length} />
        </Suspense>

        {/* 🔥 GRID FALLBACK BELOW 3D */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {allSongs.map((song) => (
            <SongCard key={song.id} {...song as any} />
          ))}
        </div>

      </div>
    </div>
  );
}
