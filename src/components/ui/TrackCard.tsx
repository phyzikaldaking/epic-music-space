"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { Track } from "@/types/music";
import { usePlayerStore } from "@/store/playerStore";

interface TrackCardProps {
  track: Track;
  queue?: Track[];
}

export function TrackCard({ track, queue }: TrackCardProps) {
  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isActive) togglePlay();
    else playTrack(track, queue);
  };

  return (
    <div className="group relative rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:bg-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer">
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={track.albumArt}
          alt={track.album}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <button
          onClick={handlePlay}
          className="absolute bottom-3 right-3 p-3 rounded-full bg-purple-600 text-white shadow-lg shadow-purple-500/30 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200"
          aria-label="Play"
        >
          <Play size={16} fill="white" />
        </button>
        {isActive && isPlaying && (
          <div className="absolute bottom-3 right-3 p-3 rounded-full bg-purple-600 text-white shadow-lg">
            <div className="w-4 h-4 flex items-end gap-0.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex-1 bg-white rounded-sm animate-bounce"
                  style={{ animationDelay: `${i * 0.1}s`, height: "60%" }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-white truncate">{track.title}</p>
        <p className="text-xs text-gray-400 truncate">{track.artist}</p>
      </div>
    </div>
  );
}
