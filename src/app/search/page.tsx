"use client";

import { useState, useEffect } from "react";
import { Search, X, Music, User, Disc3 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { searchTracks, searchArtists, searchAlbums } from "@/lib/api";
import { TrackRow } from "@/components/ui/TrackRow";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const results =
    debouncedQuery.trim()
      ? {
          tracks: searchTracks(debouncedQuery),
          artists: searchArtists(debouncedQuery),
          albums: searchAlbums(debouncedQuery),
        }
      : null;

  const clear = () => {
    setQuery("");
  };

  const hasResults =
    results &&
    (results.tracks.length > 0 || results.artists.length > 0 || results.albums.length > 0);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Search</h1>

      {/* Search input */}
      <div className="relative max-w-xl">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          placeholder="Search songs, artists, albums..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 focus:bg-white/15 transition-all"
          aria-label="Search music"
          autoFocus
        />
        {query && (
          <button
            onClick={clear}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Empty state */}
      {!query && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">🔭</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Explore the universe of music
          </h2>
          <p className="text-gray-400">Search for your favorite songs, artists, or albums</p>
        </div>
      )}

      {/* No results */}
      {query && !hasResults && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🌌</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No results found for &ldquo;{query}&rdquo;
          </h2>
          <p className="text-gray-400">Try a different search term</p>
        </div>
      )}

      {/* Results */}
      {hasResults && results && (
        <div className="space-y-8">
          {/* Tracks */}
          {results.tracks.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Music size={16} className="text-purple-400" />
                Songs ({results.tracks.length})
              </h2>
              <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
                {results.tracks.map((track, i) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    queue={results.tracks}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {results.artists.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <User size={16} className="text-pink-400" />
                Artists ({results.artists.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {results.artists.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/artist/${artist.id}`}
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-center"
                  >
                    <div className="relative w-20 h-20 rounded-full overflow-hidden">
                      <Image
                        src={artist.image}
                        alt={artist.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        unoptimized
                      />
                    </div>
                    <p className="text-sm font-medium text-white">{artist.name}</p>
                    <p className="text-xs text-gray-400">{artist.genres[0]}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {results.albums.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Disc3 size={16} className="text-blue-400" />
                Albums ({results.albums.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {results.albums.map((album) => (
                  <Link
                    key={album.id}
                    href={`/album/${album.id}`}
                    className="group rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:bg-white/10 transition-all"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={album.coverArt}
                        alt={album.title}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                        unoptimized
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-white truncate">{album.title}</p>
                      <p className="text-xs text-gray-400">{album.artist}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
