"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X, Music, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SongWithArtist, Profile } from "@/types/database";
import { usePlayerStore } from "@/store/playerStore";
import { songToTrack } from "@/components/feed/SongCard";
import { Play } from "lucide-react";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [songs, setSongs] = useState<SongWithArtist[]>([]);
  const [artists, setArtists] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSongs([]);
      setArtists([]);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const term = `%${q}%`;

    const [songRes, artistRes] = await Promise.all([
      supabase
        .from("songs")
        .select("*, profiles(*)")
        .or(`title.ilike.${term},genre.ilike.${term}`)
        .eq("is_published", true)
        .limit(20) as unknown as Promise<{ data: SongWithArtist[] | null }>,
      supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.${term},display_name.ilike.${term}`)
        .limit(10),
    ]);

    setSongs(songRes.data ?? []);
    setArtists((artistRes.data ?? []) as Profile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    runSearch(debouncedQuery);
  }, [debouncedQuery, runSearch]);

  const hasResults = songs.length > 0 || artists.length > 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white">Search</h1>

      {/* Search input */}
      <div className="relative max-w-xl">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Search songs, artists…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-11 pr-10 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 focus:bg-white/15 transition-all"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Empty state */}
      {!query && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-4">🔭</div>
          <h2 className="text-xl font-semibold text-white mb-2">Explore the universe of music</h2>
          <p className="text-gray-400">Search for your favorite songs or artists</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* No results */}
      {!loading && query && !hasResults && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🌌</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            No results for &ldquo;{query}&rdquo;
          </h2>
          <p className="text-gray-400">Try a different search term</p>
        </div>
      )}

      {/* Results */}
      {!loading && hasResults && (
        <div className="space-y-8">
          {/* Songs */}
          {songs.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Music size={16} className="text-purple-400" />
                Songs ({songs.length})
              </h2>
              <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden divide-y divide-white/5">
                {songs.map((song, i) => (
                  <div
                    key={song.id}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-gray-600 text-sm w-5 text-right">{i + 1}</span>
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0">
                      <Image
                        src={song.cover_url ?? `https://picsum.photos/seed/${song.id}/80/80`}
                        alt={song.title}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link href={`/song/${song.id}`} className="text-white text-sm font-medium hover:text-purple-300 truncate block">
                        {song.title}
                      </Link>
                      <Link href={`/${song.profiles?.username}`} className="text-gray-500 text-xs hover:text-gray-300 truncate block">
                        {song.profiles?.display_name ?? song.profiles?.username}
                      </Link>
                    </div>
                    {song.genre && (
                      <span className="text-xs text-gray-500 hidden sm:block">{song.genre}</span>
                    )}
                    <button
                      onClick={() => playTrack(songToTrack(song), songs.map(songToTrack))}
                      className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    >
                      <Play size={14} className="text-white ml-0.5" fill="white" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {artists.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <User size={16} className="text-pink-400" />
                Artists ({artists.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {artists.map((artist) => (
                  <Link
                    key={artist.id}
                    href={`/${artist.username}`}
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-center"
                  >
                    <div className="relative w-16 h-16 rounded-full overflow-hidden bg-purple-700 flex items-center justify-center">
                      {artist.avatar_url ? (
                        <Image
                          src={artist.avatar_url}
                          alt={artist.username}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="text-xl font-bold text-white">
                          {(artist.display_name ?? artist.username)[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate w-full">{artist.display_name ?? artist.username}</p>
                    <p className="text-xs text-gray-400">@{artist.username}</p>
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
