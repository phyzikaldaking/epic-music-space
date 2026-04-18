"use client";

import Image from "next/image";
import { Play, Pause, Heart } from "lucide-react";
import { Track } from "@/types/music";
import { usePlayerStore } from "@/store/playerStore";
import { usePlaylistStore } from "@/store/playlistStore";
import { formatDuration } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TrackRowProps {
  track: Track;
  index?: number;
  queue?: Track[];
  showAlbumArt?: boolean;
}

export function TrackRow({ track, index, queue, showAlbumArt = true }: TrackRowProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const { likeTrack, unlikeTrack, isLiked } = usePlaylistStore();

  const isCurrentTrack = currentTrack?.id === track.id;
  const liked = isLiked(track.id);

  const handlePlay = () => {
    if (isCurrentTrack) {
      togglePlay();
    } else {
      playTrack(track, queue);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer",
        isCurrentTrack ? "bg-purple-600/20" : "hover:bg-white/5"
      )}
      onClick={handlePlay}
    >
      {/* Index / play icon */}
      <div className="w-8 flex-shrink-0 flex items-center justify-center">
        {isCurrentTrack && isPlaying ? (
          <Pause size={16} className="text-purple-400" />
        ) : (
          <>
            <span className="group-hover:hidden text-sm text-gray-500">
              {index !== undefined ? index + 1 : <Play size={14} />}
            </span>
            <Play size={14} className="hidden group-hover:block text-white" />
          </>
        )}
      </div>

      {/* Album art */}
      {showAlbumArt && (
        <div className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden">
          <Image
            src={track.albumArt}
            alt={track.album}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium truncate", isCurrentTrack ? "text-purple-300" : "text-white")}>
          {track.title}
        </p>
        <p className="text-xs text-gray-400 truncate">{track.artist}</p>
      </div>

      {/* Like button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (liked) unlikeTrack(track.id);
          else likeTrack(track);
        }}
        className={cn(
          "p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100",
          liked ? "opacity-100 text-pink-400" : "text-gray-600 hover:text-gray-300"
        )}
        aria-label={liked ? "Unlike" : "Like"}
      >
        <Heart size={14} fill={liked ? "currentColor" : "none"} />
      </button>

      {/* Duration */}
      <span className="text-xs text-gray-500 tabular-nums w-10 text-right">
        {formatDuration(track.duration)}
      </span>
    </div>
  );
}
