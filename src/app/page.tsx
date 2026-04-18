"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, TrendingUp, Star, Disc3 } from "lucide-react";
import { getFeaturedTracks, getTrendingTracks, getNewReleases, getGenres } from "@/lib/api";
import { TrackCard } from "@/components/ui/TrackCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { usePlayerStore } from "@/store/playerStore";
import { tracks } from "@/data/mockData";

const featured = getFeaturedTracks();
const trending = getTrendingTracks();
const newReleases = getNewReleases();
const genres = getGenres();

export default function HomePage() {
  const { playTrack } = usePlayerStore();
  const heroTrack = featured[0];

  return (
    <div className="p-6 space-y-10 pb-8">
      {/* Hero */}
      {heroTrack && (
        <section
          className="relative rounded-2xl overflow-hidden min-h-64 flex items-end"
          style={{
            background:
              "linear-gradient(135deg, rgba(107,33,168,0.6) 0%, rgba(29,78,216,0.5) 50%, rgba(236,72,153,0.3) 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-20">
            <Image
              src={heroTrack.albumArt}
              alt={heroTrack.album}
              fill
              className="object-cover blur-md scale-110"
              unoptimized
            />
          </div>
          <div className="relative z-10 p-8">
            <p className="text-sm text-purple-300 font-medium mb-1 flex items-center gap-1">
              <Star size={14} /> Featured Track
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">
              {heroTrack.title}
            </h1>
            <p className="text-gray-300 mb-4">{heroTrack.artist}</p>
            <button
              onClick={() => playTrack(heroTrack, featured)}
              className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-full hover:scale-105 transition-transform shadow-xl"
            >
              <Play size={18} fill="black" />
              Play Now
            </button>
          </div>
        </section>
      )}

      {/* Featured Tracks */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Star size={18} className="text-purple-400" /> Featured
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {featured.map((track) => (
            <TrackCard key={track.id} track={track} queue={featured} />
          ))}
        </div>
      </section>

      {/* Trending */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp size={18} className="text-pink-400" /> Trending Now
        </h2>
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          {trending.slice(0, 8).map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={trending} />
          ))}
        </div>
      </section>

      {/* Browse by Genre */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">Browse by Genre</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {genres.map((genre) => (
            <div
              key={genre.id}
              className="relative rounded-xl p-5 overflow-hidden cursor-pointer hover:scale-105 transition-transform"
              style={{
                background: `linear-gradient(135deg, ${genre.color}90, ${genre.color}40)`,
                border: `1px solid ${genre.color}60`,
              }}
            >
              <span className="text-3xl">{genre.icon}</span>
              <p className="text-white font-semibold mt-2">{genre.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* New Releases */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Disc3 size={18} className="text-blue-400" /> New Releases
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {newReleases.map((album) => {
            const albumTracks = tracks.filter((t) => t.albumId === album.id);
            return (
              <Link
                key={album.id}
                href={`/album/${album.id}`}
                className="group flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
                  <Image
                    src={album.coverArt}
                    alt={album.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{album.title}</p>
                  <p className="text-xs text-gray-400 truncate">{album.artist}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {albumTracks.length} tracks · {album.releaseDate.slice(0, 4)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
