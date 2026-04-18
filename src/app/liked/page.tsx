"use client";

import { Play, Heart } from "lucide-react";
import { usePlaylistStore } from "@/store/playlistStore";
import { usePlayerStore } from "@/store/playerStore";
import { TrackRow } from "@/components/ui/TrackRow";
import { formatDuration } from "@/lib/api";

export default function LikedPage() {
  const { likedSongs } = usePlaylistStore();
  const { playTrack } = usePlayerStore();
  const totalDuration = likedSongs.reduce((sum, t) => sum + t.duration, 0);

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="p-6 flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-48 h-48 flex-shrink-0 rounded-xl bg-gradient-to-br from-pink-600 to-purple-700 flex items-center justify-center shadow-2xl shadow-pink-500/20">
          <Heart size={64} className="text-white" fill="white" />
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Playlist</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">Liked Songs</h1>
          <p className="text-sm text-gray-400 mb-4">
            {likedSongs.length} songs · {formatDuration(totalDuration)}
          </p>
          {likedSongs.length > 0 && (
            <button
              onClick={() => playTrack(likedSongs[0], likedSongs)}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-full hover:bg-purple-500 transition-colors w-fit"
            >
              <Play size={18} fill="white" />
              Play All
            </button>
          )}
        </div>
      </div>

      <div className="px-6">
        {likedSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Heart size={48} className="text-gray-600 mb-4" />
            <h2 className="text-lg font-semibold text-white mb-2">
              Songs you like will appear here
            </h2>
            <p className="text-gray-400">
              Click the heart icon on any track to add it to your liked songs
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            {likedSongs.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={likedSongs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
