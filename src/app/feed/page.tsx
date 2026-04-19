"use client";

import Link from "next/link";
import { useFeed } from "@/hooks/useFeed";
import { SongCard } from "@/components/feed/SongCard";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Music2 } from "lucide-react";

export default function FeedPage() {
  const { songs, loading, hasMore, loadMore } = useFeed();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Discover</h1>
          <p className="text-gray-400 text-sm mt-0.5">New music from the cosmos</p>
        </div>
      </div>

      {/* Feed grid */}
      {loading && songs.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Music2 size={48} className="text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No songs yet</h2>
          <p className="text-gray-400">
            Be the first to upload — go to{" "}
            <Link href="/upload" className="text-purple-400 hover:underline">Upload</Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} queue={songs} />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            className="px-6 py-2.5 rounded-xl border border-white/20 text-sm text-gray-300 hover:border-purple-500/50 hover:text-white transition-all"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
